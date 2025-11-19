const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const requestsList = document.getElementById('requestsList');
let initialRequests = []; // Will store the initial state of request cards

// Function to initialize initialRequests from the DOM
function initializeRequests() {
  initialRequests = Array.from(requestsList.children).map((li) => {
    // Extract data from the card for filtering
    const requestText = li
      .querySelector('h3 .text-truncate')
      .textContent.toLowerCase();
    const status = li.querySelector('p span').textContent.trim(); // Get the status text

    return {
      element: li,
      requestText: requestText,
      status: status,
    };
  });
}

function filterRequests() {
  const searchTerm = searchInput.value.toLowerCase();
  const selectedStatus = statusFilter.value; // Will be 'OPEN', 'CLOSED', or ''

  const filteredRequests = initialRequests.filter((request) => {
    const textMatch = request.requestText.includes(searchTerm);
    const statusMatch = !selectedStatus || request.status === selectedStatus;
    return textMatch && statusMatch;
  });

  // Clear current list and append filtered ones
  requestsList.innerHTML = '';
  filteredRequests.forEach((request) => {
    requestsList.appendChild(request.element);
  });
}

// Initialize requests when the page loads
document.addEventListener('DOMContentLoaded', () => {
  initializeRequests();
  filterRequests(); // Apply initial filter (e.g., if URL has params)
});

searchInput.addEventListener('input', filterRequests);
statusFilter.addEventListener('change', filterRequests);
