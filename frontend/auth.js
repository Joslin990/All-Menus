if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

const SUPABASE_URL = 'https://inyretblntlqugwefzpl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_1CbS4uK07oeVQmmv1DqR5Q_rRBZdFFg';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Favorites cache ───────────────────────────────────
let _favoriteIds    = new Set();
let _favoritesReady = Promise.resolve();

async function loadFavorites() {
  const session = await getAuthSession();
  if (!session) return;
  const { data } = await _supabase.from('favorites').select('place_id');
  _favoriteIds = new Set((data ?? []).map(r => r.place_id));
  // Sync any already-rendered heart buttons
  document.querySelectorAll('.fav-btn[data-place-id]').forEach(btn => {
    const on = _favoriteIds.has(btn.dataset.placeId);
    btn.innerHTML = on ? '&#9829;' : '&#9825;';
    btn.classList.toggle('fav-active', on);
  });
}

async function toggleFavorite(restaurant) {
  const session = await getAuthSession();
  if (!session) return null;
  const placeId = restaurant.id || restaurant.place_id;

  if (_favoriteIds.has(placeId)) {
    await _supabase.from('favorites').delete()
      .eq('user_id', session.user.id).eq('place_id', placeId);
    _favoriteIds.delete(placeId);
    return false;
  } else {
    await _supabase.from('favorites').insert({
      user_id:  session.user.id,
      place_id: placeId,
      name:     restaurant.name     ?? '',
      address:  restaurant.address  ?? '',
      cuisine:  restaurant.cuisine  ?? '',
      rating:   restaurant.rating   ?? null,
      price:    restaurant.price    ?? '',
      maps_url: restaurant.maps_url ?? '',
    });
    _favoriteIds.add(placeId);
    return true;
  }
}

function isFavorited(placeId) {
  return _favoriteIds.has(placeId);
}

async function getAuthSession() {
  const { data: { session } } = await _supabase.auth.getSession();
  return session;
}

// ── Nav ──────────────────────────────────────────────
function updateNav(session) {
  const loginLink  = document.querySelector('.login-link');
  const signupLink = document.querySelector('.sign-up');
  const navBar     = document.querySelector('.login-signup');
  if (!loginLink || !signupLink || !navBar) return;

  document.querySelector('.fav-nav-link')?.remove();

  if (session?.user) {
    const email = session.user.email;
    loginLink.textContent  = email.length > 22 ? email.slice(0, 20) + '…' : email;
    loginLink.href         = '#';
    loginLink.style.cursor = 'default';

    signupLink.textContent = 'Log Out';
    signupLink.href        = '#';
    signupLink.onclick     = async e => {
      e.preventDefault();
      await _supabase.auth.signOut();
      window.location.reload();
    };

    const favLink = document.createElement('a');
    favLink.href      = 'favorites.html';
    favLink.textContent = '♥ Favorites';
    favLink.className = 'fav-nav-link';
    navBar.insertBefore(favLink, loginLink);
  } else {
    loginLink.textContent  = 'Login';
    loginLink.href         = 'login.html';
    loginLink.style.cursor = '';
    signupLink.textContent = 'Sign Up';
    signupLink.href        = 'signup.html';
    signupLink.onclick     = null;
  }
}

// ── Init ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await _supabase.auth.getSession();
  updateNav(session);
  if (session) _favoritesReady = loadFavorites();

  _supabase.auth.onAuthStateChange((_event, s) => {
    updateNav(s);
    if (s) _favoritesReady = loadFavorites();
  });

  // ── Login form ───────────────────────────────────────
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email    = document.getElementById('auth-email').value.trim();
      const password = document.getElementById('auth-password').value;
      const errEl    = document.getElementById('auth-error');
      const btn      = loginForm.querySelector('button[type="submit"]');

      errEl.className = 'auth-msg';
      btn.disabled    = true;
      btn.textContent = 'Logging in…';

      const { error } = await _supabase.auth.signInWithPassword({ email, password });

      if (error) {
        errEl.textContent = error.message;
        errEl.className   = 'auth-msg auth-error';
        btn.disabled      = false;
        btn.textContent   = 'Log In';
      } else {
        const pending   = sessionStorage.getItem('pendingFavorite');
        const returnUrl = sessionStorage.getItem('pendingFavReturnUrl') || 'index.html';
        sessionStorage.removeItem('pendingFavorite');
        sessionStorage.removeItem('pendingFavReturnUrl');
        if (pending) {
          try {
            const restaurant = JSON.parse(pending);
            const { data: { session: s } } = await _supabase.auth.getSession();
            if (s) {
              await _supabase.from('favorites').upsert({
                user_id:  s.user.id,
                place_id: restaurant.id || restaurant.place_id,
                name:     restaurant.name     ?? '',
                address:  restaurant.address  ?? '',
                cuisine:  restaurant.cuisine  ?? '',
                rating:   restaurant.rating   ?? null,
                price:    restaurant.price    ?? '',
                maps_url: restaurant.maps_url ?? '',
              }, { onConflict: 'user_id,place_id', ignoreDuplicates: true });
            }
          } catch (_) {}
        }
        window.location.href = returnUrl;
      }
    });
  }

  // ── Sign-up form ─────────────────────────────────────
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async e => {
      e.preventDefault();
      const email     = document.getElementById('auth-email').value.trim();
      const password  = document.getElementById('auth-password').value;
      const confirm   = document.getElementById('auth-confirm').value;
      const errEl     = document.getElementById('auth-error');
      const successEl = document.getElementById('auth-success');
      const btn       = signupForm.querySelector('button[type="submit"]');

      errEl.className     = 'auth-msg';
      successEl.className = 'auth-msg';

      if (password !== confirm) {
        errEl.textContent = 'Passwords do not match.';
        errEl.className   = 'auth-msg auth-error';
        return;
      }
      if (password.length < 8) {
        errEl.textContent = 'Password must be at least 8 characters.';
        errEl.className   = 'auth-msg auth-error';
        return;
      }

      btn.disabled    = true;
      btn.textContent = 'Creating account…';

      const { error } = await _supabase.auth.signUp({ email, password });

      if (error) {
        errEl.textContent = error.message;
        errEl.className   = 'auth-msg auth-error';
        btn.disabled      = false;
        btn.textContent   = 'Create Account';
      } else {
        successEl.textContent = 'Account created! Check your email to confirm, then log in.';
        successEl.className   = 'auth-msg auth-success';
        signupForm.reset();
        btn.disabled    = false;
        btn.textContent = 'Create Account';
      }
    });
  }
});
