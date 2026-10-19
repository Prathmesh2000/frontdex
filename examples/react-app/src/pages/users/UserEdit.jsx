import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchUser, updateUser } from '../../lib/api';
import UserForm from './UserForm';

/** Edit page, lazy-loaded by the router. */
export default function UserEdit() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchUser(userId).then(setUser);
    return () => controller.abort();
  }, [userId]);

  const handleSave = async (values) => {
    await updateUser(userId, values);
    navigate(`/users/${userId}`);
  };

  return user ? <UserForm initial={user} onSubmit={handleSave} submitLabel="Update user" /> : <p>Loading…</p>;
}
