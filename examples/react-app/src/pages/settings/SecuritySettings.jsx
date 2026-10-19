import { useState } from 'react';
import { api } from '../../lib/api';

const PASSWORD_RE = /^(?=.*[A-Z])(?=.*\d).{10,}$/;

/** Password change + 2FA toggle. */
export default function SecuritySettings() {
  const [password, setPassword] = useState('');
  const [twoFactor, setTwoFactor] = useState(false);
  const strong = PASSWORD_RE.test(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    await api.post('/me/password', { password, twoFactor });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
      {!strong && password && <p className="form-error">Use 10+ characters with a capital and a digit</p>}
      <label><input type="checkbox" checked={twoFactor} onChange={(e) => setTwoFactor(e.target.checked)} /> Two-factor auth</label>
      <button disabled={!strong}>Update</button>
    </form>
  );
}
