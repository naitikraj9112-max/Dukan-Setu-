import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { money } from '../utils/orders'

export default function TrendChart({ points, metric, title }) {
  const sales = metric === 'sales'
  const data = sales ? points.map(day => ({ ...day, sales: day.pricedOrders ? day.sales : null })) : points
  const format = value => sales ? money(value) : value
  return <div className="chart" aria-label={title + ' chart'}>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 12, right: 14, bottom: 0, left: 0 }} accessibilityLayer>
        <defs>
          <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7558ef" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#7558ef" stopOpacity={0.025} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#eceef5" vertical={false} strokeDasharray="4 4" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={12} minTickGap={23} tick={{ fill: '#626b83', fontSize: 12 }} />
        <YAxis width={sales ? 67 : 36} allowDecimals={sales} axisLine={false} tickLine={false} tick={{ fill: '#626b83', fontSize: 12 }} tickFormatter={format} />
        <Tooltip formatter={value => [format(value), { orders: 'Orders', sales: 'Sales', customers: 'Customers' }[metric]]} contentStyle={{ border: '1px solid #ebe8f7', borderRadius: 12 }} />
        <Area type="monotone" dataKey={metric} stroke="#7357ed" strokeWidth={3} fill="url(#trend-fill)" dot={points.length === 1} activeDot={{ r: 6, fill: '#7357ed', stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
}
