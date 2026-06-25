export default function Home() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '40px', maxWidth: '600px', margin: '0 auto' }}>
      <h1>Whambam Tattoo Shop API</h1>
      <p>This is the backend for the Whambam Tattoo shop.</p>
      <ul>
        <li><code>/api/products</code> — returns product catalogue</li>
        <li><code>/api/checkout</code> — creates Stripe checkout session</li>
      </ul>
    </div>
  )
}
