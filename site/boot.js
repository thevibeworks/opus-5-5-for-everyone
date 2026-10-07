// Runs before first paint: lets CSS hide the title until app.js streams it in (2.5s CSS failsafe).
document.documentElement.classList.add('js');
