// Firebase Configuration
const firebaseConfig = {
    //
};

firebase.initializeApp(firebaseConfig);

const db = firebase.firestore();
const auth = firebase.auth();

// Enable offline persistence
db.enablePersistence().catch((err) => {
    if (err.code === "failed-precondition") {
        console.warn(
            "Multiple tabs open. Persistence can only be enabled in one tab.",
        );
    } else if (err.code === "unimplemented") {
        console.warn("Offline persistence is not supported in this browser.");
    }
});

// Register Service Worker
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then(
            (registration) => {
                console.log(
                    "ServiceWorker registration successful with scope:",
                    registration.scope,
                );
            },
            (err) => {
                console.log("ServiceWorker registration failed:", err);
            },
        );
    });
}

document.addEventListener("DOMContentLoaded", function () {
    // DOM Elements
    const signInBtn = document.getElementById("sign-in-btn");
    const signUpBtn = document.getElementById("sign-up-btn");
    const signOutBtn = document.getElementById("sign-out-btn");
    const emailInput = document.getElementById("email-input");
    const passwordInput = document.getElementById("password-input");
    const authSection = document.getElementById("auth-section");
    const todoSection = document.getElementById("todo-section");
    const feedbackContainer = document.getElementById("feedback-container");
    const loadingSpinner = document.getElementById("loading-spinner");
    const newTaskInput = document.getElementById("new-task-input");
    const taskDeadlineInput = document.getElementById("task-deadline");
    const saveTaskBtn = document.getElementById("save-task-btn");
    const taskList = document.getElementById("task-list");
    const completedTaskList = document.getElementById("completed-task-list");
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const deadlineSwitch = document.getElementById("deadline-switch");
    const deadlineContainer = document.getElementById("deadline-container");

    let tasks = [];
    let tasksDocRef = null;
    let unsubscribeSnapshot = null;

    // Initialize Flatpickr and keep a reference
    const fp = flatpickr(taskDeadlineInput, {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        allowInput: true,
    });

    // Debounce utility for future use (e.g., search functionality)
    function debounce(func, wait) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    }

    // Load and save tasks to localStorage
    function loadTasksFromCache() {
        const cachedTasks = localStorage.getItem("tasks");
        if (cachedTasks) {
            tasks = JSON.parse(cachedTasks);
        }
    }

    function saveTasksToCache() {
        localStorage.setItem("tasks", JSON.stringify(tasks));
    }

    // Feedback function
    function showFeedback(message, type) {
        const alertDiv = document.createElement("div");
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.role = "alert";
        alertDiv.textContent = message;

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "btn-close";
        closeBtn.setAttribute("data-bs-dismiss", "alert");
        closeBtn.setAttribute("aria-label", "Close");
        alertDiv.appendChild(closeBtn);

        feedbackContainer.appendChild(alertDiv);

        setTimeout(() => {
            if (alertDiv) {
                alertDiv.classList.remove("show");
                alertDiv.classList.add("hide");
            }
        }, 3000);
    }

    // Authentication
    signUpBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        try {
            await auth.createUserWithEmailAndPassword(email, password);
            showFeedback("Signed up successfully!", "success");
        } catch (error) {
            console.error("Sign Up Error:", error);
            showFeedback(error.message, "danger");
        }
    });

    signInBtn.addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        try {
            await auth.signInWithEmailAndPassword(email, password);
            showFeedback("Signed in successfully!", "success");
        } catch (error) {
            console.error("Sign In Error:", error);
            showFeedback(error.message, "danger");
        }
    });

    signOutBtn.addEventListener("click", async () => {
        try {
            await auth.signOut();
            showFeedback("Signed out successfully!", "info");
        } catch (error) {
            console.error("Sign Out Error:", error);
            showFeedback(error.message, "danger");
        }
    });

    auth.onAuthStateChanged((user) => {
        if (user) {
            authSection.classList.add("d-none");
            todoSection.classList.remove("d-none");
            tasksDocRef = db
                .collection("users")
                .doc(user.uid)
                .collection("tasks");
            loadTasksFromCache();
            initSnapshotListener();
        } else {
            if (unsubscribeSnapshot) unsubscribeSnapshot();
            authSection.classList.remove("d-none");
            todoSection.classList.add("d-none");
            tasks = [];
            renderTasks();
        }
    });

    // Initialize Firestore real-time updates via onSnapshot
    function initSnapshotListener() {
        if (!tasksDocRef) return;
        loadingSpinner.classList.remove("d-none");
        unsubscribeSnapshot = tasksDocRef
            .orderBy("addedDate", "desc")
            .limit(50)
            .onSnapshot(
                (snapshot) => {
                    tasks = snapshot.docs.map((doc) => ({
                        id: doc.id,
                        ...doc.data(),
                    }));
                    saveTasksToCache();
                    renderTasks();
                    loadingSpinner.classList.add("d-none");
                },
                (error) => {
                    console.error("Error loading tasks:", error);
                    showFeedback("Error loading tasks.", "danger");
                    loadingSpinner.classList.add("d-none");
                },
            );
    }

    function renderTasks() {
        // Separate tasks into incomplete and completed arrays
        const incompleteTasks = tasks.filter((task) => !task.completed);
        const completedTasks = tasks.filter((task) => task.completed);

        // Clear existing lists using DocumentFragment for performance
        const fragIncomplete = document.createDocumentFragment();
        const fragCompleted = document.createDocumentFragment();

        taskList.innerHTML = "";
        completedTaskList.innerHTML = "";

        // Group and render incomplete tasks
        const groupedTasks = groupTasksByDate(incompleteTasks);
        const sortedDates = Object.keys(groupedTasks).sort(
            (a, b) => new Date(b) - new Date(a),
        );

        sortedDates.forEach((dateStr) => {
            const dateHeading = document.createElement("li");
            dateHeading.className = "list-group-item bg-light fw-bold";
            dateHeading.textContent = dateStr;
            fragIncomplete.appendChild(dateHeading);

            groupedTasks[dateStr].forEach((taskObj) => {
                const li = document.createElement("li");
                li.className =
                    "list-group-item d-flex justify-content-between align-items-center";

                const taskDate = new Date(taskObj.addedDate);
                const today = new Date();
                const dateOnly = new Date(
                    taskDate.getFullYear(),
                    taskDate.getMonth(),
                    taskDate.getDate(),
                );
                const todayOnly = new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate(),
                );
                if (!taskObj.completed && dateOnly < todayOnly) {
                    li.classList.add("incomplete-old");
                }

                const localDateTimeString = taskDate.toLocaleString();
                const formattedDeadline = taskObj.deadline
                    ? new Date(taskObj.deadline).toLocaleString()
                    : "No deadline";

                li.innerHTML = `
          <div>
            <strong>${taskObj.text}</strong><br>
            <small>Added on: ${localDateTimeString}</small><br>
            <small>Deadline: ${formattedDeadline}</small>
          </div>
          <div class="btn-group">
            <button class="btn btn-sm btn-danger" onclick="deleteTask('${taskObj.id}')">Delete</button>
            <button class="btn btn-sm btn-primary" onclick="toggleTask('${taskObj.id}')">
              ${taskObj.completed ? "Undo" : "Complete"}
            </button>
          </div>
        `;

                fragIncomplete.appendChild(li);
            });
        });

        // Render completed tasks in collapsible list
        completedTasks.forEach((taskObj) => {
            const li = document.createElement("li");
            li.className =
                "list-group-item d-flex justify-content-between align-items-center completed";

            const taskDate = new Date(taskObj.addedDate);
            const localDateTimeString = taskDate.toLocaleString();
            const formattedDeadline = taskObj.deadline
                ? new Date(taskObj.deadline).toLocaleString()
                : "No deadline";

            li.innerHTML = `
        <div>
          <strong>${taskObj.text}</strong><br>
          <small>Added on: ${localDateTimeString}</small><br>
          <small>Deadline: ${formattedDeadline}</small>
        </div>
        <div class="btn-group">
          <button class="btn btn-sm btn-danger" onclick="deleteTask('${taskObj.id}')">Delete</button>
          <button class="btn btn-sm btn-primary" onclick="toggleTask('${taskObj.id}')">
            Undo
          </button>
        </div>
      `;

            fragCompleted.appendChild(li);
        });

        taskList.appendChild(fragIncomplete);
        completedTaskList.appendChild(fragCompleted);

        updateProgressBar();
    }

    function groupTasksByDate(tasksArray) {
        const groups = {};
        tasksArray.forEach((t) => {
            const dateObj = new Date(t.addedDate);
            const dateStr = dateObj.toLocaleDateString();
            if (!groups[dateStr]) {
                groups[dateStr] = [];
            }
            groups[dateStr].push(t);
        });
        return groups;
    }

    function updateProgressBar() {
        const progressBar = document.getElementById("task-progress-bar");
        const completedCount = tasks.filter((t) => t.completed).length;
        const totalCount = tasks.length;
        const percent =
            totalCount > 0
                ? Math.round((completedCount / totalCount) * 100)
                : 0;

        progressBar.style.width = percent + "%";
        progressBar.setAttribute("aria-valuenow", percent);
        progressBar.textContent = `${completedCount} / ${totalCount} (${percent}%)`;
    }

    function addTask() {
        const taskText = newTaskInput.value.trim();
        if (taskText === "") return;

        let deadlineValue = null;
        const deadlineVal = taskDeadlineInput.value.trim();
        if (deadlineVal) {
            deadlineValue = new Date(deadlineVal).toISOString();
        }

        const addedDate = new Date().toISOString();
        const newTask = {
            text: taskText,
            addedDate,
            deadline: deadlineValue,
            completed: false,
        };

        tasksDocRef
            .add(newTask)
            .then(() => {
                showFeedback("Task added successfully!", "success");
            })
            .catch((error) => {
                console.error("Error adding task:", error);
                showFeedback(error.message, "danger");
            });

        newTaskInput.value = "";
        taskDeadlineInput.value = "";

        const addTaskModal = document.getElementById("addTaskModal");
        const modal = bootstrap.Modal.getInstance(addTaskModal);
        modal.hide();
    }

    window.deleteTask = function (taskId) {
        tasksDocRef
            .doc(taskId)
            .delete()
            .then(() => {
                showFeedback("Task deleted successfully!", "info");
            })
            .catch((error) => {
                console.error("Delete Error:", error);
                showFeedback(error.message, "danger");
            });
    };

    window.toggleTask = function (taskId) {
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
            tasksDocRef
                .doc(taskId)
                .update({ completed: !task.completed })
                .then(() => {
                    showFeedback("Task updated successfully!", "success");
                })
                .catch((error) => {
                    console.error("Update Error:", error);
                    showFeedback(error.message, "danger");
                });
        }
    };

    saveTaskBtn.addEventListener("click", addTask);

    deadlineSwitch.addEventListener("change", () => {
        if (deadlineSwitch.checked) {
            deadlineContainer.classList.remove("d-none");
            // Set default date to today at 9:00 PM
            const now = new Date();
            now.setHours(21, 0, 0, 0);
            fp.setDate(now, true);
        } else {
            deadlineContainer.classList.add("d-none");
            taskDeadlineInput.value = "";
        }
    });

    // Theme Management
    function loadTheme() {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") {
            document.body.classList.add("dark");
            themeToggleBtn.textContent = "☀️ Light Mode";
        } else {
            document.body.classList.remove("dark");
            themeToggleBtn.textContent = "🌙 Dark Mode";
        }
    }

    themeToggleBtn.addEventListener("click", () => {
        const isDarkMode = document.body.classList.toggle("dark");
        localStorage.setItem("theme", isDarkMode ? "dark" : "light");
        themeToggleBtn.textContent = isDarkMode
            ? "☀️ Light Mode"
            : "🌙 Dark Mode";
    });

    loadTheme();
});
