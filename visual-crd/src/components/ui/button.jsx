export function Button({ children, onClick, className = '', variant }) {
  const base = 'rounded px-3 py-1.5 text-sm transition-colors'
  const variants = {
    destructive: 'bg-red-600 text-white hover:bg-red-700',
    secondary: 'bg-gray-200 text-gray-900 hover:bg-gray-300',
    outline: 'border border-blue-600 text-blue-600 hover:bg-blue-50',
    default: 'bg-blue-600 text-white hover:bg-blue-700'
  }
  const cls = variants[variant] || variants.default
  return <button onClick={onClick} className={`${base} ${cls} ${className}`}>{children}</button>
}
