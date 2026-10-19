import { useParams } from 'react-router-dom';
export const UserDetail = () => { const { userId } = useParams(); return <h1>User {userId}</h1>; };
export const NotFound = () => <h1>404</h1>;
export const Settings = () => <h1>Settings</h1>;
