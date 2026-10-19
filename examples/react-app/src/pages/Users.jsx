import { useNavigate } from 'react-router-dom';
export default function Users() {
  const navigate = useNavigate();
  return <ul><li onClick={() => navigate('/users/1')}>Ada</li></ul>;
}
