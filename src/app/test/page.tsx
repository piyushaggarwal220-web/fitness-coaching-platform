'use client';

export default function TestPage() {
  function handleClick() {
    alert('Button clicked!');
  }

  return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h1>Test Page</h1>
      <button 
        onClick={handleClick}
        style={{
          padding: '20px 40px',
          fontSize: '20px',
          backgroundColor: 'blue',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          cursor: 'pointer'
        }}
      >
        Click Me
      </button>
    </div>
  );
}