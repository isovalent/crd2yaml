export function Card({ className = "", children, style }) {
  return (
    <div
      className={className}
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        background: '#fff',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
export function CardContent({ className = "", children, style }) {
  return <div className={className} style={{ padding: 16, ...style }}>{children}</div>;
}
