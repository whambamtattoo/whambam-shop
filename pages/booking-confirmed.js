export default function BookingConfirmed() {
  return (
    <div style={{
      background: '#f5f5f5',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
      padding: '32px',
    }}>
      <div style={{
        maxWidth: '480px',
        background: '#fff',
        borderRadius: '16px',
        padding: '40px',
        border: '1px solid #eaeaea',
        textAlign: 'center',
      }}>
        <h1 style={{ color: '#111', marginTop: 0 }}>You&apos;re all booked in!</h1>
        <p style={{ color: '#222', lineHeight: 1.6 }}>
          Your deposit has been received and your slot is confirmed.
          You&apos;ll get a confirmation email shortly with all the details.
        </p>
        <p style={{ color: '#222', lineHeight: 1.6 }}>
          Need to change anything? Just reply to that email and we&apos;ll sort it out.
        </p>
        <p style={{ marginTop: '24px', color: '#222' }}>
          See you soon,<br />Andy
        </p>
      </div>
    </div>
  );
}
