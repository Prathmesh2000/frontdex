import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { loadUsers, setQuery, toggleSelected } from '../../store/usersSlice';

/** User list with search and multi-select. */
export default function UsersPage() {
  const { list, status, query, selectedIds } = useSelector((state) => state.users);
  const dispatch = useDispatch();

  useEffect(() => {
    const timer = setTimeout(() => dispatch(loadUsers(query)), 300);
    return () => clearTimeout(timer);
  }, [dispatch, query]);

  return (
    <>
      <input type="search" placeholder="Search users" value={query} onChange={(e) => dispatch(setQuery(e.target.value))} />
      {status === 'loading' && <p>Loading…</p>}
      <table className="table">
        <tbody>
          {list.map((u) => (
            <tr key={u.id}>
              <td><input type="checkbox" checked={selectedIds.includes(u.id)} onChange={() => dispatch(toggleSelected(u.id))} /></td>
              <td><Link to={`/users/${u.id}`}>{u.name}</Link></td>
              <td>{u.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
