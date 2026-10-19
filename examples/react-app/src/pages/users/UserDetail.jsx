import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchUser } from '../../lib/api';

/** Read-only user profile. */
export default function UserDetail() {
  const { userId } = useParams();
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;
    fetchUser(userId).then((u) => active && setUser(u));
    return () => {
      active = false;
    };
  }, [userId]);

  if (!user) return <p>Loading…</p>;
  return (
    <article>
      <h1>{user.name}</h1>
      <p>{user.email} · {user.role}</p>
      <Link to="edit">Edit</Link>
    </article>
  );
}
