"""Turn a recorded voice note into a structured DukanSetu order action."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from sarvamai import SarvamAI


MODEL = "sarvam-105b"
LANGUAGE_CONFIDENCE_THRESHOLD = 0.65

ITEM_SCHEMA = {
    "type": "object",
    "properties": {
        "product": {"type": "string"},
        "quantity": {"type": ["number", "null"]},
        "unit": {"type": ["string", "null"]},
    },
    "required": ["product", "quantity", "unit"],
    "additionalProperties": False,
}

CHANGE_SCHEMA = {
    "type": "object",
    "properties": {
        "operation": {"type": "string", "enum": ["add", "remove", "update"]},
        "product": {"type": "string"},
        "quantity": {"type": ["number", "null"]},
        "unit": {"type": ["string", "null"]},
    },
    "required": ["operation", "product", "quantity", "unit"],
    "additionalProperties": False,
}

ORDER_RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "action": {
            "type": "string",
            "enum": ["new_order", "modify_order", "confirm_order", "reject_order", "unknown"],
        },
        "items": {"type": "array", "items": ITEM_SCHEMA},
        "changes": {"type": "array", "items": CHANGE_SCHEMA},
        "needs_clarification": {"type": "boolean"},
        "clarification_question": {"type": ["string", "null"]},
    },
    "required": ["action", "items", "changes", "needs_clarification", "clarification_question"],
    "additionalProperties": False,
}


def _load_env_file() -> None:
    """Load local .env values without adding a dotenv dependency."""
    env_path = Path(__file__).with_name(".env")
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip("\"'"))


def _needs_clarification(
    *,
    transcript: str,
    language_probability: float | None,
    result: dict[str, Any],
) -> dict[str, Any]:
    """Apply deterministic checks before an order action reaches the caller."""
    if not transcript.strip():
        result.update(
            action="unknown",
            needs_clarification=True,
            clarification_question="I couldn't hear that clearly. Could you please repeat your request?",
        )
    elif language_probability is not None and language_probability < LANGUAGE_CONFIDENCE_THRESHOLD:
        result.update(
            action="unknown",
            needs_clarification=True,
            clarification_question="I couldn't identify the language clearly. Could you please repeat your request?",
        )
    elif result["action"] == "new_order":
        if not result["items"]:
            result.update(
                needs_clarification=True,
                clarification_question=result["clarification_question"]
                or "Which items would you like to order?",
            )
        elif any(
            not item["product"].strip()
            or item["quantity"] is None
            or item["quantity"] <= 0
            for item in result["items"]
        ):
            result.update(
                needs_clarification=True,
                clarification_question=result["clarification_question"]
                or "Could you clarify the product and quantity?",
            )
    elif result["action"] == "modify_order":
        if not result["changes"]:
            result.update(
                needs_clarification=True,
                clarification_question=result["clarification_question"]
                or "What would you like to change in your order?",
            )
        elif any(
            not change["product"].strip()
            or (change["operation"] != "remove" and (change["quantity"] is None or change["quantity"] <= 0))
            for change in result["changes"]
        ):
            result.update(
                needs_clarification=True,
                clarification_question=result["clarification_question"]
                or "Could you clarify which product and quantity to change?",
            )
    elif result["action"] == "unknown":
        result.update(
            needs_clarification=True,
            clarification_question=result["clarification_question"]
            or "Would you like to place an order, change one, or confirm or reject an existing order?",
        )
    return result


def process_voice_order(
    audio_path: str | Path,
    *,
    existing_order: dict[str, Any] | None = None,
    keyterms: list[str] | None = None,
) -> dict[str, Any]:
    """Transcribe a voice note and return a validated order/confirmation action.

    This function returns an action for the caller to route to order management;
    it never writes or confirms an order itself. REST transcription supports
    audio clips up to 30 seconds.
    """
    _load_env_file()
    api_key = os.environ.get("SARVAM_API_KEY")
    if not api_key:
        raise RuntimeError("Set SARVAM_API_KEY in the environment or project .env file.")

    path = Path(audio_path)
    if not path.is_file() or path.stat().st_size == 0:
        raise ValueError(f"Audio file is missing or empty: {path}")

    client = SarvamAI(api_subscription_key=api_key)
    with path.open("rb") as audio_file:
        stt_options: dict[str, Any] = {
            "file": audio_file,
            "model": "saaras:v4",
            "mode": "transcribe",
        }
        if keyterms:
            stt_options["keyterms"] = keyterms
        transcription = client.speech_to_text.transcribe(**stt_options)

    transcript = getattr(transcription, "transcript", "") or ""
    language_code = getattr(transcription, "language_code", None)
    language_probability = getattr(transcription, "language_probability", None)

    result: dict[str, Any] = {
        "transcript": transcript,
        "language_code": language_code,
        "language_probability": language_probability,
        "confidence_status": "needs_review",
        "action": "unknown",
        "items": [],
        "changes": [],
        "needs_clarification": True,
        "clarification_question": None,
    }

    if not transcript.strip() or (
        language_probability is not None and language_probability < LANGUAGE_CONFIDENCE_THRESHOLD
    ):
        result = _needs_clarification(
            transcript=transcript,
            language_probability=language_probability,
            result=result,
        )
        result["confidence_status"] = "low"
        return result

    context = {
        "transcript": transcript,
        "detected_language": language_code,
        "existing_order": existing_order,
    }
    response = client.chat.completions_v2(
        model=MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You process Kirana shop orders from multilingual customer voice transcripts. "
                    "Understand Hindi, Kannada, English, and code-mixed speech. Return only the requested "
                    "structured result. Use action new_order for a request to buy items; modify_order for "
                    "adding, removing, or changing items in the existing order; confirm_order or reject_order "
                    "only when the customer clearly approves or declines the existing order; otherwise unknown. "
                    "Do not treat a new order request as confirmation. Preserve product names as spoken, "
                    "normalize quantities to numbers and units where clear, and never invent missing values. "
                    "Ask a short clarification question in the customer's language when product, quantity, "
                    "unit, or intent is ambiguous or missing. For remove changes, quantity may be null if the "
                    "customer wants the whole product removed. A confirmation/rejection is only an action result; "
                    "do not claim the order was submitted or changed."
                ),
            },
            {"role": "user", "content": json.dumps(context, ensure_ascii=False)},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": {
                "name": "dukan_setu_voice_order",
                "strict": True,
                "schema": ORDER_RESULT_SCHEMA,
            },
        },
        reasoning_effort="none",
        max_tokens=700,
    )

    content = response.choices[0].message.content
    if not content:
        result.update(
            needs_clarification=True,
            clarification_question="I couldn't process that clearly. Could you please repeat your request?",
        )
        result["confidence_status"] = "low"
        return result

    parsed = json.loads(content)
    result.update(parsed)
    result = _needs_clarification(
        transcript=transcript,
        language_probability=language_probability,
        result=result,
    )
    result["confidence_status"] = "needs_review" if result["needs_clarification"] else "acceptable"
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Transcribe and process a DukanSetu voice order.")
    parser.add_argument("audio", help="Path to an audio file (up to 30 seconds).")
    parser.add_argument("--existing-order", help="Existing order as a JSON string for edits/confirmation.")
    args = parser.parse_args()
    existing_order = json.loads(args.existing_order) if args.existing_order else None
    print(json.dumps(process_voice_order(args.audio, existing_order=existing_order), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
