import React from 'react';
import { useNavigate } from 'react-router-dom';
import './HomePage.css';

const HomePage = () => {
  const navigate = useNavigate();

  const handleLaunchFaults = () => {
    navigate('/faults');
  };

  const handleLaunchTools = () => {
    navigate('/tools');
  };

  return (
    <div className="homepage">
      <section className="hero">
        <h1>Welcome to the AR-Enhanced Maintenance Support System</h1>
        <p>Revolutionizing public transport maintenance through Augmented Reality.</p>
      </section>
      <section className="features">
        <div className="feature">
          <h2>AR Fault Detection</h2>
          <p>Visualize and annotate faults in real-time using AR.</p>
          <button className="ar-button" onClick={handleLaunchFaults}>
            Launch Faults
          </button>
        </div>
        <div className="feature">
          <h2>Tool Tracking</h2>
          <p>Ensure tool accountability with AR-assisted tracking.</p>
          <button className="ar-button" onClick={handleLaunchTools}>
            Launch Tools
          </button>
        </div>
        <div className="feature">
          <h2>Secure Collaboration</h2>
          <p>Share information securely between authorized users.</p>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
