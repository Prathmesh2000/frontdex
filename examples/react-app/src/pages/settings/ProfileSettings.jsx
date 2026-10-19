import UserForm from '../users/UserForm';
import { api } from '../../lib/api';

/** Current admin's own profile. */
export default function ProfileSettings() {
  const save = (values) => api.patch('/me', values);
  return <UserForm initial={{ name: '', email: '', role: 'admin' }} onSubmit={save} />;
}
