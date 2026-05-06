/* ==========================================================================
   firebase-init.js
   Initializes Firebase and exposes `auth` and `db` as window globals so
   that app.js (a regular script) can access them.

   IMPORTANT: Replace the placeholder values in firebaseConfig below with
   your actual Firebase project configuration. You can find these values in
   the Firebase console under Project Settings > General > Your apps.
   ========================================================================== */

(function () {
  // ---------------------------------------------------------------------------
  // Firebase project configuration — REPLACE WITH YOUR ACTUAL VALUES
  // ---------------------------------------------------------------------------
  var firebaseConfig = {
    apiKey:            "AIzaSyC4m36Zm8mJIEkwR0ccftoq4C8XXzeTcRA",
    authDomain:        "lifeflow-5d4bb.firebaseapp.com",
    projectId:         "lifeflow-5d4bb",
    storageBucket:     "lifeflow-5d4bb.firebasestorage.app",
    messagingSenderId: "228031783731",
    appId:             "1:228031783731:web:6fc3042f746d0571059446",
    measurementId:     "G-31TRRDLSWF"
  };
  // ---------------------------------------------------------------------------

  try {
    // Initialize the Firebase app (compat SDK exposes `firebase` as a global
    // via the CDN scripts loaded in index.html before this file).
    firebase.initializeApp(firebaseConfig);

    // Expose auth and db on window so app.js can access them without being
    // a module itself.
    window._firebaseAuth = firebase.auth();
    window._firebaseDb   = firebase.firestore();

  } catch (err) {
    console.error('[firebase-init] Firebase initialization failed:', err);
    // Signal to app.js that Firebase is unavailable so it can show a toast.
    window.firebaseUnavailable = true;
  }
})();
