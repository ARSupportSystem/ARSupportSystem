import React, { useState } from 'react';
import './LoginPage.css';

const LoginPage = ({ onLogin, isSubmitting, errorMessage }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onLogin(email.trim(), password);
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <h1>Secure Access Portal</h1>
        <p>Sign in to access AR fault detection, tool tracking, and maintenance workflows.</p>
      </section>

      <section className="login-card" aria-label="Login form">
        <h2>Sign In</h2>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="login-email" className="login-label">Email</label>
          <input
            id="login-email"
            type="email"
            className="login-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@example.com"
            required
            autoComplete="email"
          />

          <label htmlFor="login-password" className="login-label">Password</label>
          <input
            id="login-password"
            type="password"
            className="login-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            required
            autoComplete="current-password"
          />

          {errorMessage && <p className="login-error">{errorMessage}</p>}

          <button type="submit" className="login-button" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
      </section>
    </div>
  );
};

export default LoginPage;
