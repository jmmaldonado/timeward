document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    const reason = params.get('reason');
    const host = params.get('host'); // El host que activó el bloqueo

    document.getElementById('blockedUrl').textContent = host || url || 'Desconocido';
    document.getElementById('blockReason').textContent = reason || 'No especificado.';


    // Set the href for the return link
    const returnLink = document.getElementById('returnLink');
    if (returnLink && url) {
        returnLink.href = url;
    } else if (returnLink) {
        returnLink.style.display = 'none'; // Hide the link if no URL is available
    }
});
