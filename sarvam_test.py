import os

from sarvamai import SarvamAI

client = SarvamAI(api_subscription_key=os.environ["SARVAM_API_KEY"])
response = client.chat.completions_v2(
    model="sarvam-105b",
    messages=[{"role": "user", "content": "Reply with exactly: Sarvam API call works."}],
    reasoning_effort="none",
    max_tokens=256,
)
print(response.choices[0].message.content)
