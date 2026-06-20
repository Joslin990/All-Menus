const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : '/api';

document.addEventListener('DOMContentLoaded', () => {
  const searchBtn      = document.querySelector('button[type="submit"]');
  const queryInput     = document.querySelector('#query-input');
  const locationInput  = document.querySelector('#location-input');
  const radiusSelect   = document.querySelector('#radius-select');
  const useLocationBtn = document.querySelector('#use-location-btn');
  const onMenuPage     = Boolean(document.querySelector('.menu-list'));

  // On the menu page, restore query + radius from URL so inputs stay in sync
  if (onMenuPage) {
    const p = new URLSearchParams(window.location.search);
    if (p.get('query')  && queryInput)    queryInput.value    = p.get('query');
    if (p.get('radius') && radiusSelect)  radiusSelect.value  = p.get('radius');
  }

  // "Use my current location" — prompts geolocation permission then navigates
  if (useLocationBtn) {
    useLocationBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        alert('Your browser does not support location access.');
        return;
      }
      useLocationBtn.textContent = 'Getting location…';
      useLocationBtn.disabled = true;
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => {
          const qs = buildQS({ lat: coords.latitude, lng: coords.longitude });
          window.location.href = `menu-selection.html?${qs}`;
        },
        () => {
          useLocationBtn.textContent = 'Use my current location';
          useLocationBtn.disabled = false;
          alert('Location access was denied. Enter an address below and click Search.');
        }
      );
    });
  }

  // On menu page, load results from URL params immediately
  if (onMenuPage) {
    const p = new URLSearchParams(window.location.search);
    const lat = p.get('lat');
    const lng = p.get('lng');
    const loc = p.get('location');

    if (lat && lng) {
      fetchResults({ lat: parseFloat(lat), lng: parseFloat(lng) });
    } else if (loc) {
      fetchResults({ location: loc });
    } else {
      fetchByGeolocation();
    }
  }

  // Search button — navigate to menu page or re-fetch on menu page
  if (searchBtn) {
    searchBtn.addEventListener('click', runSearch);
    locationInput?.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });
    queryInput?.addEventListener('keydown',    e => { if (e.key === 'Enter') runSearch(); });
  }

  function runSearch() {
    const loc = locationInput?.value.trim();
    if (onMenuPage) {
      loc ? fetchResults({ location: loc }) : fetchByGeolocation();
    } else if (loc) {
      window.location.href = `menu-selection.html?${buildQS({ location: loc })}`;
    } else {
      alert('Enter an address or use your current location.');
    }
  }
});

// Build a query string including the current query term + radius
function buildQS(extras = {}) {
  const query  = document.querySelector('#query-input')?.value.trim()  || '';
  const radius = document.querySelector('#radius-select')?.value        || 15;
  const params = new URLSearchParams({ query, radius, ...extras });
  return params.toString();
}

function getRadius() {
  return parseInt(document.querySelector('#radius-select')?.value ?? 15, 10);
}

function getQuery() {
  // Read from input if on page; fall back to URL param
  const fromInput = document.querySelector('#query-input')?.value.trim();
  if (fromInput) return fromInput;
  return new URLSearchParams(window.location.search).get('query') || '';
}

function fetchByGeolocation() {
  if (!navigator.geolocation) {
    showStatus('Geolocation not supported. Enter an address above.', 'error');
    return;
  }
  showStatus('Getting your location…', 'loading');
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => fetchResults({ lat: coords.latitude, lng: coords.longitude }),
    () => showStatus('Location access denied. Enter an address above and click Search.', 'error')
  );
}

async function fetchResults(locationParams) {
  showStatus('Loading nearby restaurants…', 'loading');

  const query  = getQuery();
  const radius = getRadius();
  const qs     = new URLSearchParams({ ...locationParams, query, radius }).toString();

  try {
    const res  = await fetch(`${API_BASE}/menus/search?${qs}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    renderCards(data);
  } catch (err) {
    showStatus(`Could not load restaurants: ${err.message}`, 'error');
  }
}

function renderCards(restaurants) {
  const ul = document.querySelector('.menu-list ul');
  if (!ul) return;

  if (!Array.isArray(restaurants) || !restaurants.length) {
    showStatus(`No restaurants found within ${getRadius()} miles. Try a different search or increase the radius.`, 'empty');
    return;
  }

  clearStatus();
  ul.innerHTML = '';

  restaurants.forEach(r => {
    const openBadge = r.open_now === true  ? '<span class="card-open">Open</span>'
                    : r.open_now === false ? '<span class="card-closed">Closed</span>'
                    : '';

    const li = document.createElement('li');
    if (r.id) {
      li.style.cursor = 'pointer';
      li.addEventListener('click', e => {
        if (e.target.closest('a') || e.target.closest('.fav-btn')) return;
        window.location.href = `restaurant-detail.html?id=${encodeURIComponent(r.id)}`;
      });
    }
    li.innerHTML = `
      <div class="card-header">
        <h3 class="card-name">${esc(r.name || 'Unknown Restaurant')}</h3>
        ${r.cuisine    ? `<span class="card-cuisine">${esc(r.cuisine)}</span>`        : ''}
        ${r.price      ? `<span class="card-price">${esc(r.price)}</span>`            : ''}
        ${r.distance != null ? `<span class="card-distance">${r.distance} mi</span>` : ''}
        ${r.id ? `<button class="fav-btn" data-place-id="${esc(r.id)}" title="Save to favorites">&#9825;</button>` : ''}
      </div>
      <div class="card-meta">
        ${r.rating != null ? `<span class="card-rating">&#9733; ${r.rating}${r.rating_count ? ` <span class="card-rating-count">(${r.rating_count.toLocaleString()})</span>` : ''}</span>` : ''}
        ${openBadge}
      </div>
      ${r.address ? `<p class="card-address">${esc(r.address)}</p>` : ''}
      ${r.maps_url ? `<a class="card-maps-link" href="${esc(r.maps_url)}" target="_blank" rel="noopener">View on Google Maps</a>` : ''}
    `;

    // Set initial heart state if favorites already loaded, then wire click
    const favBtn = li.querySelector('.fav-btn');
    if (favBtn) {
      if (isFavorited(r.id)) {
        favBtn.innerHTML = '&#9829;';
        favBtn.classList.add('fav-active');
      }
      favBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const session = await getAuthSession();
        if (!session) {
          sessionStorage.setItem('pendingFavorite', JSON.stringify(r));
          sessionStorage.setItem('pendingFavReturnUrl', window.location.href);
          window.location.href = 'login.html';
          return;
        }
        favBtn.disabled = true;
        const nowFav = await toggleFavorite(r);
        favBtn.innerHTML = nowFav ? '&#9829;' : '&#9825;';
        favBtn.classList.toggle('fav-active', nowFav);
        favBtn.disabled = false;
      });
    }

    ul.appendChild(li);
  });
}

function showStatus(message, type) {
  const ul = document.querySelector('.menu-list ul');
  if (ul) ul.innerHTML = '';
  let el = document.querySelector('#status-message');
  if (!el) {
    el = document.createElement('p');
    el.id = 'status-message';
    document.querySelector('.menu-list')?.insertAdjacentElement('beforebegin', el);
  }
  el.textContent  = message;
  el.className    = `status-message status-${type}`;
  el.style.display = 'block';
}

function clearStatus() {
  const el = document.querySelector('#status-message');
  if (el) el.style.display = 'none';
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
