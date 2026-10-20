import { useToggle } from '../hooks/useToggle';

export default function UserPage() {
  const [editing, toggle] = useToggle();
  return (
    <section>
      <h2>{editing ? 'Edit user' : 'User profile'}</h2>
      <input placeholder="Email" aria-label="Email address" />
      <button onClick={toggle}>Save user</button>
    </section>
  );
}
