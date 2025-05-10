document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('url');
    const reason = params.get('reason');
    const host = params.get('host'); // El host que activó el bloqueo

    document.getElementById('blockedUrl').textContent = host || url || 'Desconocido';
    document.getElementById('blockReason').textContent = reason || 'No especificado.';

    const optionsLink = document.getElementById('optionsLink');
    if (chrome && chrome.runtime && chrome.runtime.getURL) {
        optionsLink.href = chrome.runtime.getURL('options.html');
    } else {
        optionsLink.style.display = 'none'; // Ocultar si no se puede obtener la URL de opciones
    }
});
