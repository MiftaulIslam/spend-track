"use client";

/**
 * Last-resort boundary. Runs when the root layout itself fails, so it cannot
 * use any of the app's providers or fonts — hence the inline styles.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#fbfaf8",
          color: "#171614",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>SpendTrack couldn&rsquo;t start</h1>
          <p style={{ marginTop: 10, lineHeight: 1.6, color: "#63605a", fontSize: 15 }}>
            Something failed before the app could load. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 18,
              height: 40,
              padding: "0 18px",
              borderRadius: 8,
              border: 0,
              background: "#171614",
              color: "#fbfaf8",
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ marginTop: 14, fontSize: 11, color: "#93908a", fontFamily: "ui-monospace, monospace" }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
