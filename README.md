# Timeward

"Timeward" is a Chrome Extension that helps you monitor and limit the time you spend on specific websites. It allows you to set daily time limits and define allowed time ranges for accessing distracting sites, helping you improve your productivity and manage your online habits.

## Features

*   **Daily Time Limits:** Set a maximum amount of time you can spend on a website each day.
*   **Time-of-Day Restrictions:** Define specific hours during which a website can be accessed.
*   **Unrestricted Sites:** Mark certain websites as unrestricted, allowing unlimited access.
*   **Usage Statistics:** View how much time you've spent on each configured website today.
*   **Blocking Page:** When a site is blocked due to exceeding limits or being outside allowed hours, you will be redirected to a simple blocked page.
*   **Activations Table:** View a table of all site activations, including the time and duration of each visit.
*   **Flexible Timeframes:** Configure time limits and restrictions with more granular control over time periods.

## Installation

To install "Timeward":

1.  Download the extension files.
2.  Open Google Chrome and go to `chrome://extensions/`.
3.  Enable "Developer mode" in the top right corner.
4.  Click "Load unpacked" and select the directory where you downloaded the extension files.

The extension should now be installed and active.

## Usage

1.  **Accessing Options:** Right-click on the extension icon in the Chrome toolbar and select "Options", or go to `chrome://extensions/`, find "Control de Navegación", and click "Details" then "Extension options".
2.  **Adding/Editing Rules:**
    *   Enter the hostname of the website (e.g., `youtube.com`, `facebook.com`). Do not include `http://`, `https://`, or `www.`.
    *   Check "Acceso ilimitado" for unrestricted access.
    *   If not unrestricted, set a "Límite diario" in minutes and/or define a "Horario" (start and end time in HH:MM format).
    *   Click "Guardar Regla" to save the rule.
3.  **Deleting Rules:** Click the "Eliminar" button next to a rule in the list to remove it.
4.  **Viewing Usage:** The options page also displays your daily usage in minutes for each site with a configured limit.

The extension will automatically start monitoring and enforcing your rules as you browse.

## Development

This extension is developed using standard web technologies (HTML, CSS, JavaScript) and Chrome Extension APIs (Storage, Tabs, Alarms, WebNavigation, Scripting).
