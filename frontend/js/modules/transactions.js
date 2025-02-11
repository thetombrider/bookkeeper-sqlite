import { API_URL, formatCurrency, parseDecimalNumber } from './config.js';
import { allAccounts, loadAccounts } from './accounts.js';
import { showConfirmDialog, showSuccessMessage, showErrorMessage } from './modal.js';

// State
let allTransactions = [];
let isInitialized = false;

// Exports
export {
    loadTransactions,
    createTransaction,
    deleteTransaction,
    viewTransaction,
    addJournalEntryRow,
    removeJournalEntry,
    updateTotals,
    updateTransactionsTable
};

// Add sorting state and cached transactions
let currentSort = {
    column: 'date',
    direction: 'desc'
};
let cachedTransactions = [];

async function loadTransactions() {
    try {
        // Load accounts first for the dropdowns
        await loadAccounts();
        
        // Load transactions
        const response = await fetch(`${API_URL}/transactions/`);
        if (!response.ok) {
            throw new Error('Failed to load transactions');
        }
        const data = await response.json();
        
        // Update state
        allTransactions = [...data];
        
        // Update UI only if table exists
        const table = document.getElementById('transactionsTable');
        if (table) {
            updateTransactionsTable();
        }
        
        // Populate account filter dropdown only if it exists
        const filterAccountSelect = document.getElementById('filterAccount');
        if (filterAccountSelect) {
            filterAccountSelect.innerHTML = `
                <option value="">All accounts</option>
                ${allAccounts.map(account => `
                    <option value="${account.id}">${account.name}</option>
                `).join('')}
            `;
        }
        
        // Set up event listeners only once
        if (!isInitialized) {
            setupEventListeners();
            isInitialized = true;
        }
        
        // Check accounts availability
        if (!allAccounts || allAccounts.length === 0) {
            console.error('No accounts loaded');
            showErrorMessage('No accounts available. Please create some accounts first.');
        }
        
        return data;
    } catch (error) {
        console.error('Error loading transactions:', error);
        showErrorMessage('Error loading transactions: ' + error.message);
        return [];
    }
}

function updateTransactionsTable() {
    const table = document.getElementById('transactionsTable');
    if (!table) {
        console.error('Transaction table element not found');
        return;
    }

    const tbody = table.querySelector('tbody');
    if (!tbody) {
        console.error('Transaction table body not found');
        return;
    }

    // Clear existing content
    tbody.innerHTML = '';

    // Sort transactions by date (newest first)
    const sortedTransactions = [...allTransactions].sort((a, b) => 
        new Date(b.transaction_date) - new Date(a.transaction_date)
    );

    // Add new content
    const tableContent = sortedTransactions.map(transaction => {
        const debitEntries = transaction.journal_entries.filter(entry => entry.debit_amount > 0);
        const creditEntries = transaction.journal_entries.filter(entry => entry.credit_amount > 0);
        const amount = debitEntries.reduce((sum, entry) => sum + parseFloat(entry.debit_amount), 0);

        return `
            <tr>
                <td>${formatDate(transaction.transaction_date)}</td>
                <td>${transaction.description}</td>
                <td>${formatAccountsList(debitEntries)}</td>
                <td>${formatAccountsList(creditEntries)}</td>
                <td class="text-end numeric">${formatCurrency(amount)}</td>
                <td class="text-end">
                    <button class="btn btn-sm btn-outline-primary me-2" data-action="view" data-id="${transaction.id}">
                        <i class="bi bi-eye"></i> View
                    </button>
                    <button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="${transaction.id}">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tbody.innerHTML = tableContent;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('it-IT');
}

function formatAccountsList(entries) {
    if (!entries || entries.length === 0) return '-';
    if (entries.length === 1) {
        return `${entries[0].account.name}`;
    }
    return `${entries[0].account.name} (+${entries.length - 1} more)`;
}

function setupEventListeners() {
    // Add Transaction button
    const addBtn = document.querySelector('[data-action="add-transaction"]');
    if (addBtn) {
        addBtn.onclick = showTransactionForm;
    }

    // Import button
    const importBtn = document.querySelector('[data-action="import-transactions"]');
    if (importBtn) {
        importBtn.onclick = () => {
            showErrorMessage('Import functionality coming soon!');
        };
    }

    // Transaction form
    const form = document.getElementById('transactionEditForm');
    if (form) {
        form.addEventListener('submit', handleTransactionSubmit);
    }

    // Cancel button
    const cancelBtn = form?.querySelector('[data-action="cancel-edit"]');
    if (cancelBtn) {
        cancelBtn.onclick = hideTransactionForm;
    }

    // Journal entries list - handle remove entry and account changes
    const journalEntriesList = document.querySelector('.journal-entries-list');
    if (journalEntriesList) {
        journalEntriesList.addEventListener('click', (e) => {
            const removeBtn = e.target.closest('[data-action="remove-entry"]');
            if (removeBtn) {
                const row = removeBtn.closest('.journal-entry-row');
                if (row) {
                    removeJournalEntry(row);
                }
            }
        });

        // Add change event listener for account selects
        journalEntriesList.addEventListener('change', (e) => {
            if (e.target.classList.contains('journal-entry-account')) {
                validateAccountUsage(e.target);
            }
        });
    }

    // Table actions
    const tbody = document.querySelector('#transactionsTable tbody');
    if (tbody) {
        tbody.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const action = button.dataset.action;
            const id = button.dataset.id;
            
            if (action === 'view') {
                await viewTransaction(id);
            } else if (action === 'delete') {
                await handleDeleteTransaction(id);
            }
        });
    }

    // Apply filters button
    const filterBtn = document.querySelector('[data-action="apply-filters"]');
    if (filterBtn) {
        filterBtn.onclick = applyFilters;
    }
}

function showTransactionForm() {
    const form = document.getElementById('transactionForm');
    if (form) {
        form.style.display = 'block';
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // Set today's date as default
        const dateInput = document.getElementById('transactionDate');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // Add initial journal entry if none exist
        const entriesList = document.querySelector('.journal-entries-list');
        if (entriesList && !entriesList.children.length) {
            addJournalEntryRow();
        }
    }
}

function hideTransactionForm() {
    const formContainer = document.getElementById('transactionForm');
    const form = document.getElementById('transactionEditForm');
    const entriesList = document.querySelector('.journal-entries-list');
    
    if (formContainer) {
        formContainer.style.display = 'none';
    }
    
    if (form && entriesList) {
        form.reset();
        // Keep only one entry row
        entriesList.innerHTML = '';
        // Add a fresh journal entry row
        addJournalEntryRow();
        // Reset totals
        updateTotals();
    }
}

function addJournalEntryRow() {
    const entriesList = document.querySelector('.journal-entries-list');
    if (!entriesList) return;

    // Get template
    const template = document.getElementById('journalEntryTemplate');
    if (!template) return;

    // Clone template
    const newRow = template.content.cloneNode(true);
    
    // Add accounts to select
    const select = newRow.querySelector('.journal-entry-account');
    if (select) {
        select.innerHTML = `
            <option value="">Select account...</option>
            ${allAccounts.map(account => `
                <option value="${account.id}">${account.name}</option>
            `).join('')}
        `;
    }

    // Add input event listeners for debit/credit fields
    const debitInput = newRow.querySelector('.journal-entry-debit');
    const creditInput = newRow.querySelector('.journal-entry-credit');

    if (debitInput && creditInput) {
        debitInput.addEventListener('input', function() {
            if (this.value) creditInput.value = '';
            updateTotals();
        });

        creditInput.addEventListener('input', function() {
            if (this.value) debitInput.value = '';
            updateTotals();
        });
    }

    entriesList.appendChild(newRow);
    updateTotals();
}

function removeJournalEntry(row) {
    if (row) {
        row.remove();
        updateTotals();
    }
}

function updateTotals() {
    let totalDebits = 0;
    let totalCredits = 0;
    
    document.querySelectorAll('.journal-entry-row').forEach(row => {
        const debit = parseFloat(row.querySelector('.journal-entry-debit').value) || 0;
        const credit = parseFloat(row.querySelector('.journal-entry-credit').value) || 0;
        
        totalDebits += debit;
        totalCredits += credit;
    });
    
    const debitsElement = document.getElementById('total-debits');
    const creditsElement = document.getElementById('total-credits');
    
    if (debitsElement) debitsElement.textContent = formatCurrency(totalDebits);
    if (creditsElement) creditsElement.textContent = formatCurrency(totalCredits);
    
    // Highlight totals if they don't match
    const totalsMatch = Math.abs(totalDebits - totalCredits) < 0.01;
    if (debitsElement) debitsElement.style.color = totalsMatch ? 'inherit' : '#dc3545';
    if (creditsElement) creditsElement.style.color = totalsMatch ? 'inherit' : '#dc3545';
}

async function handleTransactionSubmit(e) {
    e.preventDefault();
    
    // Disable submit button to prevent double submission
    const submitButton = e.target.querySelector('button[type="submit"]');
    if (submitButton) {
        if (submitButton.disabled) {
            return; // Already submitting
        }
        submitButton.disabled = true;
        submitButton.innerHTML = '<i class="bi bi-hourglass"></i> Saving...';
    }
    
    try {
        // Get all journal entries
        const entriesList = document.querySelector('.journal-entries-list');
        if (!entriesList) {
            showErrorMessage('Error: Journal entries list not found');
            return;
        }

        const entries = [];
        const usedAccounts = new Set();
        let hasValidationError = false;

        // Validate description first
        const description = document.getElementById('transactionDescription')?.value?.trim();
        if (!description) {
            showErrorMessage('Description is required');
            return;
        }

        // Validate date
        const transactionDate = document.getElementById('transactionDate')?.value;
        if (!transactionDate) {
            showErrorMessage('Date is required');
            return;
        }

        const journalRows = entriesList.querySelectorAll('.journal-entry-row');
        if (!journalRows || journalRows.length === 0) {
            showErrorMessage('No journal entries found');
            return;
        }

        journalRows.forEach(row => {
            const accountSelect = row.querySelector('.journal-entry-account');
            const debitInput = row.querySelector('.journal-entry-debit');
            const creditInput = row.querySelector('.journal-entry-credit');

            if (!accountSelect || !debitInput || !creditInput) {
                hasValidationError = true;
                showErrorMessage('Invalid journal entry row structure');
                return;
            }

            const accountId = accountSelect.value;
            const debit = parseFloat(debitInput.value) || 0;
            const credit = parseFloat(creditInput.value) || 0;
            
            // Skip empty rows
            if (!accountId || (debit === 0 && credit === 0)) {
                return;
            }

            // Check if account is already used
            if (usedAccounts.has(accountId)) {
                hasValidationError = true;
                showErrorMessage('Each account can only be used once per transaction.');
                return;
            }

            // Check if trying to debit and credit same account
            if (debit > 0 && credit > 0) {
                hasValidationError = true;
                showErrorMessage('An account cannot be both debited and credited in the same entry.');
                return;
            }

            usedAccounts.add(accountId);
            entries.push({
                account_id: accountId,
                debit_amount: debit,
                credit_amount: credit
            });
        });

        // Stop if validation failed
        if (hasValidationError) {
            return;
        }

        // Validate minimum entries
        if (entries.length < 2) {
            showErrorMessage('At least two journal entries are required');
            return;
        }

        // Calculate totals
        const totalDebits = entries.reduce((sum, entry) => sum + entry.debit_amount, 0);
        const totalCredits = entries.reduce((sum, entry) => sum + entry.credit_amount, 0);

        // Validate debits = credits with small tolerance for floating point arithmetic
        if (Math.abs(totalDebits - totalCredits) >= 0.01) {
            showErrorMessage('Total debits must equal total credits');
            return;
        }

        const formData = {
            transaction_date: transactionDate,
            description: description,
            entries: entries
        };

        const result = await createTransaction(formData);
        if (result) {
            showSuccessMessage('Transaction created successfully!');
            hideTransactionForm();
            // Update local state and table
            allTransactions = [result, ...allTransactions];
            updateTransactionsTable();
        }
    } catch (error) {
        console.error('Error creating transaction:', error);
        showErrorMessage('Error creating transaction: ' + error.message);
        // Refresh to get current state in case of error
        await loadTransactions();
    } finally {
        // Re-enable submit button
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = 'Save Transaction';
        }
    }
}

async function handleDeleteTransaction(id) {
    const transaction = allTransactions.find(t => t.id === id);
    if (!transaction) {
        showErrorMessage('Transaction not found');
        return;
    }

    if (await showConfirmDialog(`Are you sure you want to delete this transaction?`)) {
        try {
            const deleted = await deleteTransaction(id);
            if (deleted) {
                showSuccessMessage('Transaction deleted successfully');
                // Remove from local array immediately
                allTransactions = allTransactions.filter(t => t.id !== id);
                updateTransactionsTable();
            } else {
                // Transaction was already deleted
                showErrorMessage('Transaction was already deleted');
                // Refresh to get current state
                await loadTransactions();
            }
        } catch (error) {
            console.error('Error in handleDeleteTransaction:', error);
            showErrorMessage('Error deleting transaction: ' + error.message);
            // Refresh to get current state in case of error
            await loadTransactions();
        }
    }
}

async function applyFilters() {
    const startDate = document.getElementById('filterStartDate').value;
    const endDate = document.getElementById('filterEndDate').value;
    const accountId = document.getElementById('filterAccount').value;

    try {
        let url = `${API_URL}/transactions/`;
        const params = new URLSearchParams();
        
        if (startDate) params.append('start_date', startDate);
        if (endDate) params.append('end_date', endDate);
        if (accountId) {
            // Make sure we're sending the account_id as a string
            params.append('account_id', accountId.toString());
            // Specify that we want to match either credit or debit account
            params.append('account_filter_type', 'any');
        }

        const queryString = params.toString();
        if (queryString) {
            url += '?' + queryString;
        }

        console.log('Fetching filtered transactions from:', url);
        
        const response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to load filtered transactions');
        }

        const data = await response.json();
        console.log('Received filtered transactions:', data);

        // Clear existing transactions and update with filtered data
        allTransactions = [...data];
        
        // If no transactions found after filtering, show a message but don't clear the table
        if (allTransactions.length === 0) {
            showErrorMessage('No transactions found for the selected filters');
        }
        
        // Update the table with filtered results
        updateTransactionsTable();
        
        // Show success message
        showSuccessMessage('Filters applied successfully');
    } catch (error) {
        console.error('Error applying filters:', error);
        showErrorMessage('Error applying filters: ' + error.message);
    }
}

async function createTransaction(transactionData) {
    const response = await fetch(`${API_URL}/transactions/`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(transactionData)
    });

    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Error creating transaction');
    }

    return response.json();
}

async function deleteTransaction(id) {
    try {
        const response = await fetch(`${API_URL}/transactions/${id}`, {
            method: 'DELETE',
            headers: {
                'Accept': 'application/json'
            }
        });

        if (!response.ok) {
            // For 404, just return false as the transaction is already gone
            if (response.status === 404) {
                return false;
            }
            const errorData = await response.json();
            throw new Error(errorData.detail || 'Failed to delete transaction');
        }

        return true;
    } catch (error) {
        console.error('Error in deleteTransaction:', error);
        throw error;  // Re-throw to be handled by caller
    }
}

async function viewTransaction(id) {
    try {
        // Check for existing modal instance and dispose it
        const modalElement = document.getElementById('viewTransactionModal');
        if (!modalElement) {
            throw new Error('Modal element not found');
        }

        // Get existing modal instance if any and dispose it
        const existingModal = bootstrap.Modal.getInstance(modalElement);
        if (existingModal) {
            existingModal.dispose();
        }

        const response = await fetch(`${API_URL}/transactions/${id}`);
        if (!response.ok) {
            throw new Error('Failed to load transaction details');
        }
        const transaction = await response.json();

        // Update the modal content
        const modalBody = modalElement.querySelector('.modal-body');
        modalBody.innerHTML = `
            <div class="mb-3">
                <label class="fw-bold">Date:</label>
                <div>${formatDate(transaction.transaction_date)}</div>
            </div>
            <div class="mb-3">
                <label class="fw-bold">Description:</label>
                <div>${transaction.description}</div>
            </div>
            <div class="mb-3">
                <label class="fw-bold">Entries:</label>
                <table class="table table-sm">
                    <thead>
                        <tr>
                            <th>Account</th>
                            <th class="text-end">Debit</th>
                            <th class="text-end">Credit</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${transaction.journal_entries.map(entry => `
                            <tr>
                                <td>${entry.account.name}</td>
                                <td class="text-end numeric">${formatCurrency(entry.debit_amount)}</td>
                                <td class="text-end numeric">${formatCurrency(entry.credit_amount)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;

        // Create and show new modal instance
        const modal = new bootstrap.Modal(modalElement);
        
        // Add hidden event handler
        modalElement.addEventListener('hidden.bs.modal', () => {
            modal.dispose();
            // Remove modal backdrop if it exists
            const backdrop = document.querySelector('.modal-backdrop');
            if (backdrop) {
                backdrop.remove();
            }
            // Remove modal-open class and inline styles from body
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            document.body.style.removeProperty('overflow');
        }, { once: true }); // Use once: true to ensure the listener is removed after execution

        modal.show();
    } catch (error) {
        showErrorMessage('Error viewing transaction: ' + error.message);
    }
}

// Add this new function to validate account usage
function validateAccountUsage(changedSelect) {
    const selectedAccountId = changedSelect.value;
    if (!selectedAccountId) return;

    const allAccountSelects = document.querySelectorAll('.journal-entry-account');
    const currentRow = changedSelect.closest('.journal-entry-row');
    const currentDebit = currentRow.querySelector('.journal-entry-debit');
    const currentCredit = currentRow.querySelector('.journal-entry-credit');

    let accountUsages = [];

    // Collect all usages of the selected account
    allAccountSelects.forEach(select => {
        if (select.value === selectedAccountId && select !== changedSelect) {
            const row = select.closest('.journal-entry-row');
            const debit = row.querySelector('.journal-entry-debit').value;
            const credit = row.querySelector('.journal-entry-credit').value;
            
            if (debit) accountUsages.push('debit');
            if (credit) accountUsages.push('credit');
        }
    });

    // If account is already used
    if (accountUsages.length > 0) {
        showErrorMessage('This account is already used in another entry. An account can only be used once per transaction.');
        changedSelect.value = ''; // Reset the selection
        return;
    }

    // Add input event listeners to prevent debit/credit on same account
    currentDebit.addEventListener('input', () => {
        if (currentDebit.value && currentCredit.value) {
            showErrorMessage('An account cannot be both debited and credited in the same entry.');
            currentDebit.value = '';
        }
    });

    currentCredit.addEventListener('input', () => {
        if (currentDebit.value && currentCredit.value) {
            showErrorMessage('An account cannot be both debited and credited in the same entry.');
            currentCredit.value = '';
        }
    });
}

// Instead, export an initialization function
export async function initializeTransactions() {
    if (!isInitialized) {
        await loadTransactions();
    }
}

// Initialize when the module is loaded
document.addEventListener('DOMContentLoaded', initializeTransactions);
