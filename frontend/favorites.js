document.addEventListener('DOMContentLoaded', async () => {
  const session = await getAuthSession();
  if (!session) { window.location.href = 'login.html'; return; }

  const container = document.getElementById('favorites-container');
  container.innerHTML = '<p class="status-message status-loading">Loading favorites…</p>';

  const { data, error } = await _supabase
    .from('favorites')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<p class="status-message status-error">Could not load favorites: ${esc(error.message)}</p>`;
    return;
  }

  if (!data.length) {
    container.innerHTML = '<p class="status-message status-empty">No favorites yet — search for restaurants and tap ♡ to save them.</p>';
    return;
  }

  container.innerHTML = '';
  const ul = document.createElement('ul');
  container.appendChild(ul);

  data.forEach(fav => {
    const li = document.createElement('li');
    li.style.cursor = 'pointer';
    li.addEventListener('click', e => {
      if (e.target.closest('a') || e.target.closest('.fav-btn')) return;
      window.location.href = `restaurant-detail.html?id=${encodeURIComponent(fav.place_id)}`;
    });

    li.innerHTML = `
      <div class="card-header">
        <h3 class="card-name">${esc(fav.name || 'Unknown Restaurant')}</h3>
        ${fav.cuisine ? `<span class="card-cuisine">${esc(fav.cuisine)}</span>` : ''}
        ${fav.price   ? `<span class="card-price">${esc(fav.price)}</span>`    : ''}
        <button class="fav-btn fav-active" data-place-id="${esc(fav.place_id)}" title="Remove from favorites">&#9829;</button>
      </div>
      <div class="card-meta">
        ${fav.rating != null ? `<span class="card-rating">&#9733; ${fav.rating}</span>` : ''}
      </div>
      ${fav.address  ? `<p class="card-address">${esc(fav.address)}</p>`  : ''}
      ${fav.maps_url ? `<a class="card-maps-link" href="${esc(fav.maps_url)}" target="_blank" rel="noopener">View on Google Maps</a>` : ''}
    `;

    const favBtn = li.querySelector('.fav-btn');
    favBtn.addEventListener('click', async e => {
      e.stopPropagation();
      favBtn.disabled = true;
      await _supabase.from('favorites').delete()
        .eq('user_id', session.user.id)
        .eq('place_id', fav.place_id);
      li.remove();
      if (!ul.children.length) {
        container.innerHTML = '<p class="status-message status-empty">No favorites yet — search for restaurants and tap ♡ to save them.</p>';
      }
    });

    ul.appendChild(li);
  });
});

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
