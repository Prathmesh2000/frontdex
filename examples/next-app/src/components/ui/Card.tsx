function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return <header className="card-header"><h3>{title}</h3>{action}</header>;
}

function CardBody({ children }: { children: React.ReactNode }) {
  return <div className="card-body">{children}</div>;
}

/** Surface container. Compose with <Card.Header> and <Card.Body>. */
export function Card({ children, elevated = false }: { children: React.ReactNode; elevated?: boolean }) {
  return <section className={elevated ? 'card elevated' : 'card'}>{children}</section>;
}

Card.Header = CardHeader;
Card.Body = CardBody;
