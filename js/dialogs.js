function getEl (id) {
	return document.getElementById(id);
}

export function requestTextInput ({
	title,
	message,
	defaultValue = '',
	confirmText = 'Confirm'
}) {
	const modal = getEl('text-input-modal');
	if (!modal) return Promise.resolve(null);
	
	const titleEl = modal.querySelector('[data-text-dialog-title]');
	const messageEl = modal.querySelector('[data-text-dialog-message]');
	const inputEl = modal.querySelector('[data-text-dialog-input]');
	const confirmBtn = modal.querySelector('[data-text-dialog-confirm]');
	const cancelBtn = modal.querySelector('[data-text-dialog-cancel]');
	
	titleEl.textContent = title;
	messageEl.textContent = message;
	inputEl.value = defaultValue;
	confirmBtn.textContent = confirmText;
	
	return new Promise(resolve => {
		const cleanup = () => {
			confirmBtn.removeEventListener('click', handleConfirm);
			cancelBtn.removeEventListener('click', handleCancel);
			modal.removeEventListener('cancel', handleCancel);
			inputEl.removeEventListener('keydown', handleKeydown);
		};
		
		const closeWith = (value) => {
			cleanup();
			if (modal.open) modal.close();
			resolve(value);
		};
		
		const handleConfirm = () => closeWith(inputEl.value);
		const handleCancel = () => closeWith(null);
		const handleKeydown = (event) => {
			if (event.key === 'Enter') {
				event.preventDefault();
				handleConfirm();
			}
		};
		
		confirmBtn.addEventListener('click', handleConfirm);
		cancelBtn.addEventListener('click', handleCancel);
		modal.addEventListener('cancel', handleCancel);
		inputEl.addEventListener('keydown', handleKeydown);
		
		modal.showModal();
		inputEl.focus();
		inputEl.select();
	});
}
