const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const responsesList = document.getElementById('responsesList');
let initialResponses = []; // Will store the initial state of response cards

// Function to initialize initialResponses from the DOM
function initializeResponses() {
  initialResponses = Array.from(responsesList.children).map((li) => {
    // Extract data from the card for filtering
    const requestText = li
      .querySelector('h3 .text-truncate')
      .textContent.toLowerCase();
    const responseText = li
      .querySelector('p .text-truncate')
      .textContent.toLowerCase();
    const status = li.querySelector('.response-status-value').textContent.trim(); // Use the new specific class

    return {
      element: li,
      requestText: requestText,
      responseText: responseText,
      status: status,
    };
  });
}

function filterResponses() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedStatus = statusFilter.value; // Will be 'SENT', 'CHOSEN', or ''

  const filteredResponses = initialResponses.filter((response) => {
    const textMatch =
      response.requestText.includes(searchTerm) ||
      response.responseText.includes(searchTerm);
    const statusMatch = !selectedStatus || response.status === selectedStatus;
    return textMatch && statusMatch;
  });

  // Clear current list and append filtered ones
  responsesList.innerHTML = '';
  filteredResponses.forEach((response) => {
    responsesList.appendChild(response.element);
  });
}

// Initialize responses when the page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeResponses();
  filterResponses(); // Apply initial filter (e.g., if URL has params)
});

searchInput.addEventListener('input', filterResponses);
statusFilter.addEventListener('change', filterResponses);
