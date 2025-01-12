/////////////////////////////////////////////////////////
// 1) Firebase Configuration
/////////////////////////////////////////////////////////
const firebaseConfig = {
    //paste config
};

// Initialize Firebase
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

if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
        navigator.serviceWorker.register("/sw.js").then(
            function (registration) {
                console.log(
                    "ServiceWorker registration successful with scope: ",
                    registration.scope,
                );
            },
            function (err) {
                console.log("ServiceWorker registration failed: ", err);
            },
        );
    });
}

/*************************************************
 *  2) DOM Elements & Global Variables
 *************************************************/
document.addEventListener("DOMContentLoaded", function () {
    // Auth
    const signInBtn = document.getElementById("sign-in-btn");
    const signUpBtn = document.getElementById("sign-up-btn");
    const signOutBtn = document.getElementById("sign-out-btn");
    const emailInput = document.getElementById("email-input");
    const passwordInput = document.getElementById("password-input");
    const authSection = document.getElementById("auth-section");
    const todoSection = document.getElementById("todo-section");
    // Feedback & loading
    const feedbackContainer = document.getElementById("feedback-container");
    const loadingSpinner = document.getElementById("loading-spinner");
    // Tasks
    const newTaskInput = document.getElementById("new-task-input");
    const taskDeadlineDate = document.getElementById("task-deadline-date");
    const taskDeadlineTime = document.getElementById("task-deadline-time");
    const saveTaskBtn = document.getElementById("save-task-btn");
    const taskList = document.getElementById("task-list");
    // Theme
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const deadlineSwitch = document.getElementById("deadline-switch");
    const deadlineContainer = document.getElementById("deadline-container");

    let tasks = [];
    let tasksDocRef = null;

    /*************************************************
     *  3) Local Storage for Tasks
     *************************************************/
    function loadTasksFromCache() {
        const cachedTasks = localStorage.getItem("tasks");
        if (cachedTasks) {
            tasks = JSON.parse(cachedTasks);
        }
    }

    function saveTasksToCache() {
        localStorage.setItem("tasks", JSON.stringify(tasks));
    }

    /*************************************************
     *  4) Authentication
     *************************************************/
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

    // Auth state listener
    auth.onAuthStateChanged((user) => {
        if (user) {
            authSection.classList.add("d-none");
            todoSection.classList.remove("d-none");
            tasksDocRef = db
                .collection("users")
                .doc(user.uid)
                .collection("tasks");
            // Load from local storage
            loadTasksFromCache();
            // Then load from Firestore
            loadTasksFromFirestore();
        } else {
            authSection.classList.remove("d-none");
            todoSection.classList.add("d-none");
            tasks = [];
            renderTasks();
        }
    });

    /*************************************************
     *  5) Firestore Load & Save
     *************************************************/
    async function loadTasksFromFirestore() {
        if (!tasksDocRef) return;
        loadingSpinner.classList.remove("d-none");
        try {
            const querySnapshot = await tasksDocRef
                .orderBy("addedDate", "desc")
                .limit(50)
                .get();
            tasks = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data(),
            }));
            saveTasksToCache();
            renderTasks();
        } catch (error) {
            console.error("Error loading tasks:", error);
            showFeedback("Error loading tasks.", "danger");
        } finally {
            loadingSpinner.classList.add("d-none");
        }
    }

    async function saveTasksToFirestore() {
        if (!tasksDocRef) return;

        // 1) Get existing docs
        const existingDocs = await tasksDocRef.get();
        // 2) Create a batch
        const batch = db.batch();
        // 3) Convert local tasks to map
        const localTasksMap = new Map();
        tasks.forEach((task) => {
            if (!task.id) {
                task.id = tasksDocRef.doc().id;
            }
            localTasksMap.set(task.id, task);
        });
        // 4) For any doc in Firestore not in localTasksMap, delete it
        existingDocs.forEach((doc) => {
            if (!localTasksMap.has(doc.id)) {
                batch.delete(tasksDocRef.doc(doc.id));
            }
        });
        // 5) Upsert each local task
        tasks.forEach((task) => {
            const docRef = tasksDocRef.doc(task.id);
            batch.set(docRef, task);
        });
        // 6) Commit
        try {
            await batch.commit();
            showFeedback("Tasks synced with Firestore!", "success");
        } catch (error) {
            console.error("Error syncing tasks:", error);
            showFeedback("Error syncing tasks.", "danger");
        }
    }

    /*************************************************
     *  6) Rendering & Grouping
     *************************************************/
    function renderTasks() {
        taskList.innerHTML = "";

        // Group tasks by local date
        const groupedTasks = groupTasksByDate(tasks);

        // Sort date keys descending
        const sortedDates = Object.keys(groupedTasks).sort(
            (a, b) => new Date(b) - new Date(a),
        );

        // Render each group
        sortedDates.forEach((dateStr) => {
            // Sub-heading for this date
            const dateHeading = document.createElement("li");
            dateHeading.className = "list-group-item bg-light fw-bold";
            dateHeading.textContent = dateStr; // e.g. 1/14/2025
            taskList.appendChild(dateHeading);

            groupedTasks[dateStr].forEach((taskObj) => {
                const li = document.createElement("li");
                li.className =
                    "list-group-item d-flex justify-content-between align-items-center";

                // Mark as completed
                if (taskObj.completed) {
                    li.classList.add("completed");
                }

                // Highlight incomplete tasks older than today
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
                    li.classList.add("bg-warning-incomplete");
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
              <div>
                <button class="btn btn-sm btn-danger" onclick="deleteTask('${taskObj.id}')">
                  Delete
                </button>
                <button class="btn btn-sm btn-primary" onclick="toggleTask('${taskObj.id}')">
                  ${taskObj.completed ? "Undo" : "Complete"}
                </button>
              </div>
            `;

                taskList.appendChild(li);
            });
        });

        // Update progress bar
        updateProgressBar();
    }

    // Group tasks by local date string
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

    // Progress bar
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

    /*************************************************
     *  7) Task Operations (Add, Delete, Toggle)
     *************************************************/
    // Add new task
    function addTask() {
        const taskText = newTaskInput.value.trim();
        if (taskText === "") return;

        // Combine date + time for the deadline
        let deadlineValue = null;
        const dateVal = taskDeadlineDate.value.trim();
        const timeVal = taskDeadlineTime.value.trim();
        if (dateVal && timeVal) {
            deadlineValue = new Date(`${dateVal}T${timeVal}`).toISOString();
        } else if (dateVal) {
            // If only date is provided, default to midnight
            deadlineValue = new Date(dateVal).toISOString();
        }

        const addedDate = new Date().toISOString();
        const newTask = {
            text: taskText,
            addedDate,
            deadline: deadlineValue,
            completed: false,
        };

        tasks.push(newTask);
        saveTasksToCache();
        saveTasksToFirestore();
        renderTasks();

        // Clear form
        newTaskInput.value = "";
        taskDeadlineDate.value = "";
        taskDeadlineTime.value = "";

        // Hide the modal
        const addTaskModal = document.getElementById("addTaskModal");
        const modal = bootstrap.Modal.getInstance(addTaskModal);
        modal.hide();
    }

    // Delete a task
    window.deleteTask = function (taskId) {
        tasks = tasks.filter((t) => t.id !== taskId);
        saveTasksToCache();
        saveTasksToFirestore();
        renderTasks();
    };

    // Toggle a task’s completion
    window.toggleTask = function (taskId) {
        const task = tasks.find((t) => t.id === taskId);
        if (task) {
            task.completed = !task.completed;
        }
        saveTasksToCache();
        saveTasksToFirestore();
        renderTasks();
    };

    // Save button
    saveTaskBtn.addEventListener("click", addTask);

    // Deadline Switch
    deadlineSwitch.addEventListener("change", () => {
        if (deadlineSwitch.checked) {
            deadlineContainer.classList.remove("d-none");
        } else {
            deadlineContainer.classList.add("d-none");
            taskDeadlineDate.value = "";
            taskDeadlineTime.value = "";
        }
    });

    /*************************************************
     *  8) Theme Toggle with Persistence
     *************************************************/
    function loadTheme() {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") {
            document.body.classList.add("dark");
            themeToggleBtn.textContent = "Light Mode";
        } else {
            document.body.classList.remove("dark");
            themeToggleBtn.textContent = "Dark Mode";
        }
    }

    themeToggleBtn.addEventListener("click", () => {
        const isDarkMode = document.body.classList.toggle("dark");
        localStorage.setItem("theme", isDarkMode ? "dark" : "light");
        themeToggleBtn.textContent = isDarkMode ? "Light Mode" : "Dark Mode";
    });

    loadTheme(); // Apply theme on page load

    /*************************************************
     *  9) Feedback Alerts
     *************************************************/
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

        // Auto-hide the alert after 3 seconds
        setTimeout(() => {
            if (alertDiv) {
                alertDiv.classList.remove("show");
                alertDiv.classList.add("hide");
            }
        }, 3000);
    }
});
