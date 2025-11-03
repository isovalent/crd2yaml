export function Input(props) {
  const { className = '', ...rest } = props
  return <input {...rest} className={`border rounded p-2 h-9 w-full ${className}`} />
}
