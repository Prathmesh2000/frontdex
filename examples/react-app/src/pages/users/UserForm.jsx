import { useState } from 'react';
import * as yup from 'yup';

export const userSchema = yup.object({
  name: yup.string().required('Name is required').min(2),
  email: yup.string().email('Invalid email').required('Email is required'),
  role: yup.mixed().oneOf(['admin', 'editor', 'viewer']).required(),
});

/** Controlled user form validated with yup. */
export default function UserForm({ initial, onSubmit, submitLabel = 'Save' }) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});

  const handleChange = (e) => setValues({ ...values, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const valid = await userSchema.validate(values, { abortEarly: false });
      setErrors({});
      onSubmit(valid);
    } catch (err) {
      setErrors(Object.fromEntries(err.inner.map((i) => [i.path, i.message])));
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-row"><label>Name<input name="name" required value={values.name} onChange={handleChange} /></label>{errors.name && <span className="form-error">{errors.name}</span>}</div>
      <div className="form-row"><label>Email<input name="email" type="email" required value={values.email} onChange={handleChange} /></label>{errors.email && <span className="form-error">{errors.email}</span>}</div>
      <div className="form-row"><label>Role<select name="role" value={values.role} onChange={handleChange}><option>admin</option><option>editor</option><option>viewer</option></select></label></div>
      <button type="submit">{submitLabel}</button>
    </form>
  );
}
