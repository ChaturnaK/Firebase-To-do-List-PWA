// Google API credentials – replace with your own.
const API_KEY = "AIzaSyAWODHO-BAEU8foxnvrTubwuWIhD2wph0s";
const CLIENT_ID =
    "984594508745-d9kg3jfgdidjqi1ojvv5mcr3jburobmk.apps.googleusercontent.com";
const DISCOVERY_DOCS = [
    "https://sheets.googleapis.com/$discovery/rest?version=v4",
];
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";

let tasks = [];
let spreadsheetId = null;
let isDarkMode = JSON.parse(localStorage.getItem("isDarkMode")) || false;

// Initialize Google API client.
function initClient() {
    gapi.client
        .init({
            apiKey: API_KEY,
            clientId: CLIENT_ID,
            discoveryDocs: DISCOVERY_DOCS,
            scope: SCOPES,
        })
        .then(
            () => {
                checkForStoredSheet();
                applyTheme();
            },
            (error) => {
                console.error(JSON.stringify(error, null, 2));
            },
        );
}

gapi.load("client:auth2", initClient);

// Check for stored sheet ID.
function checkForStoredSheet() {
    const storedSheetId = localStorage.getItem("spreadsheetId");
    if (storedSheetId) {
        spreadsheetId = storedSheetId;
        handleSheet();
    } else {
        document.getElementById("sheet-link-modal").style.display = "block";
    }
}

// Save sheet URL, extract spreadsheet ID, store it.
document.getElementById("save-sheet-link-btn").addEventListener("click", () => {
    const inputURL = document.getElementById("sheet-link-input").value.trim();
    const match = inputURL.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) {
        spreadsheetId = match[1];
        localStorage.setItem("spreadsheetId", spreadsheetId);
        document.getElementById("sheet-link-modal").style.display = "none";
        handleSheet();
    } else {
        alert("Please enter a valid Google Sheet URL.");
    }
});

// Check if sheet is empty, populate headers if needed, then fetch tasks.
function handleSheet() {
    checkSheetEmpty(spreadsheetId)
        .then((isEmpty) => {
            if (isEmpty) {
                populateHeaders(spreadsheetId).then(() => {
                    console.log("Headers populated");
                    fetchAndRenderTasks();
                });
            } else {
                fetchAndRenderTasks();
            }
        })
        .catch((error) => {
            console.error("Error handling sheet:", error);
        });
}

function checkSheetEmpty(sheetId) {
    return gapi.client.sheets.spreadsheets.values
        .get({
            spreadsheetId: sheetId,
            range: "Sheet1!A1:D1",
        })
        .then((response) => {
            const values = response.result.values;
            return !values || values.length === 0;
        });
}

function populateHeaders(sheetId) {
    const headers = [["Task", "AddedDate", "Deadline", "Completed"]];
    return gapi.client.sheets.spreadsheets.values.update({
        spreadsheetId: sheetId,
        range: "Sheet1!A1:D1",
        valueInputOption: "RAW",
        resource: { values: headers },
    });
}

function fetchTasks(sheetId) {
    return gapi.client.sheets.spreadsheets.values
        .get({
            spreadsheetId: sheetId,
            range: "Sheet1!A2:D",
        })
        .then((response) => response.result.values || []);
}

function fetchAndRenderTasks() {
    fetchTasks(spreadsheetId)
        .then((sheetData) => {
            tasks = sheetData.map((row) => ({
                text: row[0] || "",
                addedDate: row[1] || "",
                deadline: row[2] || "",
                completed: row[3] === "true",
            }));
            renderTasks();
        })
        .catch((error) => console.error("Error fetching tasks:", error));
}

function renderTasks() {
    const taskList = document.getElementById("task-list");
    taskList.innerHTML = "";
    tasks.forEach((task, index) => {
        const li = document.createElement("li");
        li.className = task.completed ? "completed" : "";
        li.innerHTML = `
      <div class="task-details">
        <span><strong>Task:</strong> ${task.text}</span>
        <span><strong>Added on:</strong> ${task.addedDate}</span>
        <span><strong>Deadline:</strong> ${task.deadline || "No deadline"}</span>
      </div>
      <div>
        <button onclick="deleteTask(${index})">Delete</button>
        <button onclick="toggleTask(${index})">${task.completed ? "Undo" : "Complete"}</button>
      </div>
    `;
        taskList.appendChild(li);
    });
}

function addTask() {
    const taskInput = document.getElementById("new-task-input");
    const deadlineSwitch = document.getElementById("deadline-switch");
    const taskDeadlineInput = document.getElementById("task-deadline");

    const taskText = taskInput.value.trim();
    const taskDeadline = deadlineSwitch.checked
        ? taskDeadlineInput.value.trim()
        : "";
    if (taskText === "") return;

    const addedDate = new Date().toLocaleDateString();
    const newTask = {
        text: taskText,
        addedDate: addedDate,
        deadline: taskDeadline,
        completed: false,
    };

    tasks.push(newTask);

    // Append new task to Google Sheet.
    gapi.client.sheets.spreadsheets.values
        .append({
            spreadsheetId: spreadsheetId,
            range: "Sheet1!A:D",
            valueInputOption: "RAW",
            resource: {
                values: [
                    [
                        newTask.text,
                        newTask.addedDate,
                        newTask.deadline,
                        newTask.completed,
                    ],
                ],
            },
        })
        .then((response) => {
            console.log("Task appended:", response);
            renderTasks();
        })
        .catch((error) => {
            console.error("Error appending task:", error);
        });

    taskInput.value = "";
    taskDeadlineInput.value = "";
}

window.deleteTask = function (index) {
    // Removing locally for demonstration.
    tasks.splice(index, 1);
    // Implement deletion from Google Sheet here.
    renderTasks();
};

window.toggleTask = function (index) {
    tasks[index].completed = !tasks[index].completed;
    // Implement update to Google Sheet here.
    renderTasks();
};

// Event listeners for adding tasks, theme toggle, and deadline switch.
document.getElementById("add-task-btn").addEventListener("click", addTask);

document
    .getElementById("theme-toggle-btn")
    .addEventListener("click", function () {
        isDarkMode = !isDarkMode;
        localStorage.setItem("isDarkMode", JSON.stringify(isDarkMode));
        applyTheme();
    });

document
    .getElementById("deadline-switch")
    .addEventListener("change", function () {
        const taskDeadlineInput = document.getElementById("task-deadline");
        if (this.checked) {
            taskDeadlineInput.style.display = "block";
        } else {
            taskDeadlineInput.style.display = "none";
            taskDeadlineInput.value = "";
        }
    });

function applyTheme() {
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    if (isDarkMode) {
        document.body.classList.add("dark");
        themeToggleBtn.textContent = "Switch to Light Mode";
    } else {
        document.body.classList.remove("dark");
        themeToggleBtn.textContent = "Switch to Dark Mode";
    }
}
