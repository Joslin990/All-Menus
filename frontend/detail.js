const API_BASE = window.location.hostname === 'localhost'
  ? 'http://localhost:3001/api'
  : '/api';

document.addEventListener('DOMContentLoaded', async () => {
  const params    = new URLSearchParams(window.location.search);
  const id        = params.get('id');
  const container = document.getElementById('detail-content');

  if (!id) {
    container.innerHTML = '<p class="status-message status-error">No restaurant ID provided.</p>';
    return;
  }

  try {
    const [res] = await Promise.all([
      fetch(`${API_BASE}/menus/place/${encodeURIComponent(id)}`),
      typeof _favoritesReady !== 'undefined' ? _favoritesReady : Promise.resolve(),
    ]);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'API error');
    renderDetail(data, container);
    wireFavBtn(data, container);
  } catch (err) {
    container.innerHTML = `<p class="status-message status-error">Could not load restaurant: ${esc(err.message)}</p>`;
  }
});

function renderDetail(r, container) {
  const openBadge = r.open_now === true  ? '<span class="card-open">Open Now</span>'
                  : r.open_now === false ? '<span class="card-closed">Closed</span>'
                  : '';

  const photosHtml = r.photos.length
    ? `<div class="photo-gallery">
        ${r.photos.map(ref =>
          `<img class="photo-thumb" src="${API_BASE}/menus/photo?ref=${encodeURIComponent(ref)}&maxWidth=700" alt="Photo of ${esc(r.name)}" loading="lazy">`
        ).join('')}
      </div>`
    : '';

  const hoursHtml = r.hours.length
    ? `<div class="detail-section">
        <h3 class="section-title">Hours</h3>
        <ul class="hours-list">
          ${r.hours.map(h => `<li>${esc(h)}</li>`).join('')}
        </ul>
      </div>`
    : '';

  const summaryHtml = r.summary
    ? `<p class="detail-summary">${esc(r.summary)}</p>`
    : '';

  const ratingHtml = r.rating != null
    ? `<div class="detail-rating">
        <span class="card-rating">&#9733; ${r.rating}</span>
        ${r.rating_count ? `<span class="card-rating-count">(${r.rating_count.toLocaleString()} reviews)</span>` : ''}
      </div>`
    : '';

  container.innerHTML = `
    ${photosHtml}
    <div class="detail-info">
      <div class="detail-header">
        <div class="detail-name-row">
          <h2 class="detail-name">${esc(r.name)}</h2>
          <button class="fav-btn detail-fav-btn" data-place-id="${esc(r.id)}" title="Save to favorites">&#9825;</button>
        </div>
        <div class="detail-badges">
          ${r.cuisine ? `<span class="card-cuisine">${esc(r.cuisine)}</span>` : ''}
          ${r.price   ? `<span class="card-price">${esc(r.price)}</span>`    : ''}
          ${openBadge}
        </div>
        ${ratingHtml}
      </div>
      ${summaryHtml}
      <div class="detail-section">
        <h3 class="section-title">Contact &amp; Location</h3>
        ${r.address ? `<p class="detail-field"><strong>Address:</strong> ${esc(r.address)}</p>` : ''}
        ${r.phone   ? `<p class="detail-field"><strong>Phone:</strong> <a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></p>` : ''}
        ${r.website ? `<p class="detail-field"><strong>Website:</strong> <a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(r.website)}</a></p>` : ''}
        ${r.maps_url ? `<a class="btn-action btn-maps" href="${esc(r.maps_url)}" target="_blank" rel="noopener">View on Google Maps</a>` : ''}
      </div>
      ${hoursHtml}
      <div class="detail-section">
        <h3 class="section-title">Menu</h3>
        <p class="menu-note">Full menus are available on the restaurant&apos;s website or via Google Maps.</p>
        <div class="menu-cta-row">
          ${r.website  ? `<a class="btn-action btn-website" href="${esc(r.website)}"  target="_blank" rel="noopener">Visit Website / View Menu</a>` : ''}
          ${r.maps_url ? `<a class="btn-action btn-maps"    href="${esc(r.maps_url)}" target="_blank" rel="noopener">Find Menu on Google Maps</a>`  : ''}
        </div>
      </div>
    </div>
  `;
}

function wireFavBtn(r, container) {
  const favBtn = container.querySelector('.detail-fav-btn');
  if (!favBtn) return;

  if (isFavorited(r.id)) {
    favBtn.innerHTML = '&#9829;';
    favBtn.classList.add('fav-active');
  }

  favBtn.addEventListener('click', async e => {
    e.stopPropagation();
    const session = await getAuthSession();
    if (!session) {
      sessionStorage.setItem('pendingFavorite', JSON.stringify({
        id: r.id, name: r.name, address: r.address, cuisine: r.cuisine,
        rating: r.rating, price: r.price, maps_url: r.maps_url,
      }));
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

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
