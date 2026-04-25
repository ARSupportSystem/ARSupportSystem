import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header';
import HomePage from './components/HomePage';
import ARCamera from './components/ARCamera';
import LoginPage from './components/LoginPage';
import { getMeRequest, loginRequest, logoutRequest } from './services/authApi';
import './App.css';

function ProtectedRoute({ isAuthenticated, isReady, children }) {
  if (!isReady) {
    return (
      <section className="auth-loading">
        <p>Checking session…</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function AppRoutes({ isAuthenticated, isReady, onLogin, isSubmitting, loginError }) {
  const location = useLocation();

  return (
    <main>
      <div className="page-transition" key={location.pathname}>
        <Routes location={location}>
          <Route
            path="/login"
            element={
              isAuthenticated
                ? <Navigate to="/" replace />
                : <LoginPage onLogin={onLogin} isSubmitting={isSubmitting} errorMessage={loginError} />
            }
          />
          <Route
            path="/"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} isReady={isReady}>
                <HomePage />
              </ProtectedRoute>
            }
          />
          <Route path="/ar-camera" element={<Navigate to="/faults" replace />} />
          <Route
            path="/faults"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} isReady={isReady}>
                <ARCamera />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tools"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} isReady={isReady}>
                <ARCamera />
              </ProtectedRoute>
            }
          />
          <Route
            path="/monitoring"
            element={
              <ProtectedRoute isAuthenticated={isAuthenticated} isReady={isReady}>
                <HomePage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </main>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem('authToken') || '');
  const [currentUser, setCurrentUser] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    const bootstrapAuth = async () => {
      if (!token) {
        setIsReady(true);
        return;
      }

      try {
        const me = await getMeRequest(token);
        setCurrentUser(me);
      } catch (error) {
        localStorage.removeItem('authToken');
        setToken('');
        setCurrentUser(null);
      } finally {
        setIsReady(true);
      }
    };

    bootstrapAuth();
  }, [token]);

  const handleLogin = async (email, password) => {
    setIsSubmitting(true);
    setLoginError('');

    try {
      const loginPayload = await loginRequest(email, password);
      const accessToken = loginPayload.access_token;
      localStorage.setItem('authToken', accessToken);
      setToken(accessToken);
      const me = await getMeRequest(accessToken);
      setCurrentUser(me);
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unable to sign in';
      setLoginError(detail);
      setCurrentUser(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (token) {
      try {
        await logoutRequest(token);
      } catch (error) {
      }
    }

    localStorage.removeItem('authToken');
    setToken('');
    setCurrentUser(null);
    setLoginError('');
  };

  return (
    <Router>
      <div className="App">
        <Header isAuthenticated={Boolean(currentUser)} currentUser={currentUser} onLogout={handleLogout} />
        <AppRoutes
          isAuthenticated={Boolean(currentUser)}
          isReady={isReady}
          onLogin={handleLogin}
          isSubmitting={isSubmitting}
          loginError={loginError}
        />
      </div>
    </Router>
  );
}

export default App;
