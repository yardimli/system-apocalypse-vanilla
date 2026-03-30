import { gameState, gameData } from './state.js';
import { addToLog } from './utils.js';

/**
 * Renders the sandbox UI with editable tables for game data.
 * @param {HTMLElement} contentArea - The DOM element to render into.
 */
export function renderSandbox(contentArea) {
	if (!document.getElementById('sandbox-container')) {
		contentArea.innerHTML = `
        <div id="sandbox-container" class="card bg-base-200 shadow-xl p-6">
            <h2 class="text-2xl font-bold mb-4">Sandbox Mode</h2>
            <p class="mb-4 text-sm text-gray-400">Edit the table cells directly. Click "Apply Changes" to save.</p>
            
            <div class="flex flex-col gap-6">
                ${buildTableSection('Monsters', 'monsters')}
                ${buildTableSection('Skills', 'skills')}
                ${buildTableSection('Items', 'items')}
                ${buildTableSection('Recipes', 'recipes')}
            </div>

            <div class="mt-6 flex gap-4 items-end">
                <div>
                    <label class="label"><span class="label-text">Game Time (Ticks)</span></label>
                    <input type="number" id="sandbox-time" class="input input-bordered w-full max-w-xs" />
                </div>
                <button id="sandbox-apply" class="btn btn-primary">Apply Changes</button>
            </div>
        </div>`;
	}
	
	// Update time dynamically if the user isn't currently editing it
	const timeInput = document.getElementById('sandbox-time');
	if (timeInput && document.activeElement !== timeInput) {
		timeInput.value = gameState.time;
	}
}

/**
 * Builds an HTML table for a specific category of game data.
 * @param {string} title - The display title for the section.
 * @param {string} category - The key in gameData (e.g., 'monsters').
 * @returns {string} HTML string of the table.
 */
function buildTableSection(title, category) {
	const data = gameData[category];
	if (!data || data.length === 0) return `<p>No data for ${title}</p>`;
	
	// Extract all unique keys across all objects in the array to form headers
	const headers = Array.from(new Set(data.flatMap(Object.keys)));
	
	return `
    <div class="overflow-x-auto bg-base-100 rounded-box border border-base-300">
        <h3 class="font-bold p-4 bg-base-300">${title}</h3>
        <table class="table table-xs table-zebra w-full" data-category="${category}">
            <thead>
                <tr>
                    ${headers.map(h => `<th>${h}</th>`).join('')}
                </tr>
            </thead>
            <tbody>
                ${data.map(row => `
                    <tr>
                        ${headers.map(h => {
		let val = row[h];
		// Format arrays as comma-separated strings for easy editing
		let displayVal = Array.isArray(val) ? val.join(', ') : (val ?? '');
		let type = Array.isArray(val) ? 'array' : typeof val;
		
		// Make cells contenteditable and store original data type
		return `<td contenteditable="true" class="border border-base-300 p-2 outline-none focus:bg-base-200" data-key="${h}" data-type="${type}">${displayVal}</td>`;
	}).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>`;
}

/**
 * Reads the editable tables and applies the changes back to gameData.
 */
export function applySandboxChanges() {
	try {
		const tables = document.querySelectorAll('#sandbox-container table');
		
		tables.forEach(table => {
			const category = table.dataset.category;
			const newData =[];
			
			table.querySelectorAll('tbody tr').forEach(tr => {
				const obj = {};
				tr.querySelectorAll('td').forEach(td => {
					const key = td.dataset.key;
					const type = td.dataset.type;
					let rawVal = td.innerText.trim();
					
					// Skip empty values unless they were originally strings
					if (rawVal === '' && type !== 'string') return;
					
					let val;
					// Parse the value back to its original type
					if (type === 'number') {
						val = Number(rawVal);
						if (isNaN(val)) val = rawVal; // Fallback if user typed text
					} else if (type === 'array') {
						val = rawVal.split(',').map(s => s.trim()).filter(Boolean);
					} else if (type === 'boolean') {
						val = rawVal.toLowerCase() === 'true';
					} else {
						val = rawVal;
					}
					
					obj[key] = val;
				});
				newData.push(obj);
			});
			
			// Update the global game data
			gameData[category] = newData;
		});
		
		// Update game time
		const timeInput = document.getElementById('sandbox-time');
		if (timeInput) {
			gameState.time = parseInt(timeInput.value, 10) || gameState.time;
		}
		
		addToLog('Sandbox changes applied successfully.');
	} catch (err) {
		alert('Error applying sandbox changes. Check console.');
		console.error(err);
	}
}
