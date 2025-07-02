// --- Modern To-Do App UI Overhaul ---
// Firebase config is loaded globally from firebaseConfig.js

firebase.initializeApp(window.firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

db.enablePersistence().catch((err) => {
    if (err.code === "failed-precondition") {
        console.warn("Multiple tabs open. Persistence can only be enabled in one tab.");
    } else if (err.code === "unimplemented") {
        console.warn("Offline persistence is not supported in this browser.");
    }
});

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js").then(
            (registration) => {
                console.log("ServiceWorker registration successful with scope:", registration.scope);
            },
            (err) => {
                console.log("ServiceWorker registration failed:", err);
            },
        );
    });
}

document.addEventListener("DOMContentLoaded", function () {
    // --- DOM Elements ---
    const appContainer = document.querySelector(".app-container");
    const topNavbar = document.getElementById("top-navbar");
    const authModal = new bootstrap.Modal(document.getElementById("authModal"));
    const loginForm = document.getElementById("login-form");
    const signupForm = document.getElementById("signup-form");
    const showSignupLink = document.getElementById("show-signup");
    const showLoginLink = document.getElementById("show-login");

    const userEmailElem = document.getElementById("sidebar-user-email");
    const userAvatar = document.getElementById("user-avatar");
    const themeToggleBtn = document.getElementById("theme-toggle-btn");
    const signOutBtn = document.getElementById("sign-out-btn");
    const fabAddTask = document.getElementById("fab-add-task");
    const taskList = document.getElementById("task-list");
    const progressBar = document.getElementById("task-progress-bar");
    const filterChips = document.querySelectorAll(".filter-chips .btn");
    const snackbar = document.getElementById("snackbar");
    // Modal & Form
    const taskModal = new bootstrap.Modal(document.getElementById("taskModal"));
    const taskForm = document.getElementById("task-form");
    const taskTextInput = document.getElementById("task-text");
    const taskDeadlineInput = document.getElementById("task-deadline");
    const taskPriorityInput = document.getElementById("task-priority");
    const taskIdInput = document.getElementById("task-id");

    let tasks = [];
    let tasksDocRef = null;
    let unsubscribeSnapshot = null;
    let currentFilter = "active";
    let lastDeletedTask = null;
    let lastDeletedTaskId = null;

    // Flatpickr for deadline
    const fp = flatpickr(taskDeadlineInput, {
        enableTime: true,
        dateFormat: "Y-m-d H:i",
        allowInput: true,
    });

    // --- Authentication Modal Logic ---
    showSignupLink.addEventListener("click", (e) => {
        e.preventDefault();
        loginForm.style.display = "none";
        signupForm.style.display = "block";
    });

    showLoginLink.addEventListener("click", (e) => {
        e.preventDefault();
        signupForm.style.display = "none";
        loginForm.style.display = "block";
    });

    // Login form submission
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("login-email").value;
        const password = document.getElementById("login-password").value;

        try {
            await auth.signInWithEmailAndPassword(email, password);
            showSnackbar("Signed in successfully!");
        } catch (error) {
            showSnackbar(error.message, true);
        }
    });

    // Signup form submission
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const email = document.getElementById("signup-email").value;
        const password = document.getElementById("signup-password").value;
        const confirmPassword = document.getElementById("signup-confirm-password").value;

        if (password !== confirmPassword) {
            showSnackbar("Passwords do not match!", true);
            return;
        }

        try {
            await auth.createUserWithEmailAndPassword(email, password);
            showSnackbar("Account created successfully!");
        } catch (error) {
            showSnackbar(error.message, true);
        }
    });

    // --- Auth State ---
    auth.onAuthStateChanged((user) => {
        if (user) {
            // User is signed in
            authModal.hide();
            appContainer.style.display = "block";
            topNavbar.style.display = "flex";
            userEmailElem.textContent = user.email;
            userAvatar.textContent = user.email ? user.email[0].toUpperCase() : "?";
            tasksDocRef = db.collection("users").doc(user.uid).collection("tasks");
            initSnapshotListener();
        } else {
            // User is signed out
            appContainer.style.display = "none";
            topNavbar.style.display = "none";
            authModal.show();
            userEmailElem.textContent = "Not signed in";
            userAvatar.textContent = "?";
            if (unsubscribeSnapshot) unsubscribeSnapshot();
            tasks = [];
            renderTasks();
        }
    });

    // --- Sign Out ---
    signOutBtn.addEventListener("click", async () => {
        try {
            await auth.signOut();
            showSnackbar("Signed out.");
        } catch (error) {
            showSnackbar(error.message, true);
        }
    });

    // --- Theme Toggle ---
    function loadTheme() {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") {
            document.body.classList.add("dark");
            themeToggleBtn.innerHTML = '<i class="bi bi-sun"></i>';
        } else {
            document.body.classList.remove("dark");
            themeToggleBtn.innerHTML = '<i class="bi bi-moon"></i>';
        }
    }
    themeToggleBtn.addEventListener("click", () => {
        const isDark = document.body.classList.toggle("dark");
        localStorage.setItem("theme", isDark ? "dark" : "light");
        themeToggleBtn.innerHTML = isDark ? '<i class="bi bi-sun"></i>' : '<i class="bi bi-moon"></i>';
    });
    loadTheme();

    // --- Floating Action Button: Add Task ---
    fabAddTask.addEventListener("click", () => {
        openTaskModal();
    });

    // --- Filter Chips ---
    filterChips.forEach((chip) => {
        chip.addEventListener("click", () => {
            filterChips.forEach((c) => c.classList.remove("active"));
            chip.classList.add("active");
            currentFilter = chip.getAttribute("data-filter");
            renderTasks();
        });
    });

    // --- Modal: Add/Edit Task ---
    function openTaskModal(task = null) {
        if (task) {
            taskTextInput.value = task.text;
            taskDeadlineInput.value = task.deadline ? new Date(task.deadline).toLocaleString("sv-SE").replace("T", " ").slice(0, 16) : "";
            taskPriorityInput.value = task.priority || "normal";
            taskIdInput.value = task.id;
            document.getElementById("taskModalLabel").textContent = "Edit Task";
        } else {
            taskTextInput.value = "";
            taskDeadlineInput.value = "";
            taskPriorityInput.value = "normal";
            taskIdInput.value = "";
            document.getElementById("taskModalLabel").textContent = "New Task";
        }
        fp.setDate(taskDeadlineInput.value || null, true);
        setTimeout(() => taskTextInput.focus(), 300);
        taskModal.show();
    }

    // --- Save Task (Add/Edit) ---
    taskForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = taskTextInput.value.trim();
        const deadlineVal = taskDeadlineInput.value.trim();
        const deadline = deadlineVal ? new Date(deadlineVal).toISOString() : null;
        const priority = taskPriorityInput.value;
        const id = taskIdInput.value;
        if (!text) return;
        const now = new Date().toISOString();
        if (id) {
            // Edit
            tasksDocRef.doc(id).update({ text, deadline, priority }).then(() => {
                showSnackbar("Task updated.");
                taskModal.hide();
            }).catch((err) => showSnackbar(err.message, true));
        } else {
            // Add
            const newTask = { text, addedDate: now, deadline, completed: false, priority };
            tasksDocRef.add(newTask).then(() => {
                showSnackbar("Task added.");
                taskModal.hide();
            }).catch((err) => showSnackbar(err.message, true));
        }
    });

    // --- Firestore Real-time Updates ---
    function initSnapshotListener() {
        if (!tasksDocRef) return;
        if (unsubscribeSnapshot) unsubscribeSnapshot();
        unsubscribeSnapshot = tasksDocRef.orderBy("addedDate", "desc").limit(100).onSnapshot(
            (snapshot) => {
                tasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
                renderTasks();
            },
            (error) => {
                showSnackbar("Error loading tasks.", true);
            }
        );
    }

    // --- Render Tasks as Cards (List View) ---
    function renderTasks() {
        taskList.innerHTML = "";
        let filtered = tasks;
        const now = new Date();
        if (currentFilter === "active") {
            filtered = tasks.filter((t) => !t.completed);
        } else if (currentFilter === "completed") {
            filtered = tasks.filter((t) => t.completed);
        } else if (currentFilter === "overdue") {
            filtered = tasks.filter((t) => !t.completed && t.deadline && new Date(t.deadline) < now);
        }
        if (filtered.length === 0) {
            taskList.innerHTML = '<div class="text-center text-muted py-5">No tasks found.</div>';
        } else {
            filtered.forEach((task) => {
                const card = document.createElement("div");
                card.className = "task-card d-flex flex-row align-items-center justify-content-between px-4 py-3" + (task.completed ? " completed" : "");
                card.style.marginBottom = "1rem";
                // Priority badge
                const priority = `<span class=\"task-priority ${task.priority || 'normal'}\">${(task.priority || 'normal').charAt(0).toUpperCase() + (task.priority || 'normal').slice(1)}</span>`;
                // Deadline
                let deadline = "<span class='text-muted'>No deadline</span>";
                if (task.deadline) {
                    const d = new Date(task.deadline);
                    deadline = `<span class='${!task.completed && d < now ? 'text-danger fw-bold' : 'text-muted'}'>${d.toLocaleString()}</span>`;
                }
                // Card inner HTML (improved layout)
                card.innerHTML = `
                  <div class=\"d-flex flex-column flex-md-row align-items-md-center gap-3 flex-grow-1\">
                    <div class=\"d-flex align-items-center gap-2\">
                      <span class=\"fw-bold task-title\">${task.text}</span>
                      ${priority}
                    </div>
                    <div class=\"task-meta text-muted small d-flex flex-column flex-md-row gap-2\">
                      <span><i class=\"bi bi-calendar-plus\"></i> ${new Date(task.addedDate).toLocaleString()}</span>
                      <span><i class=\"bi bi-calendar-event\"></i> ${deadline}</span>
                    </div>
                  </div>
                  <div class=\"task-actions d-flex gap-2 ms-3\">
                    <button class=\"btn btn-sm btn-outline-primary\" title=\"Edit\" aria-label=\"Edit task\"><i class=\"bi bi-pencil\"></i></button>
                    <button class=\"btn btn-sm btn-outline-success\" title=\"${task.completed ? 'Undo' : 'Complete'}\" aria-label=\"${task.completed ? 'Undo' : 'Complete'}\"><i class=\"bi ${task.completed ? 'bi-arrow-counterclockwise' : 'bi-check2-circle'}\"></i></button>
                    <button class=\"btn btn-sm btn-outline-danger\" title=\"Delete\" aria-label=\"Delete task\"><i class=\"bi bi-trash\"></i></button>
                  </div>
                `;
                // Action buttons
                const [editBtn, completeBtn, deleteBtn] = card.querySelectorAll(".task-actions button");
                editBtn.addEventListener("click", () => openTaskModal(task));
                completeBtn.addEventListener("click", () => toggleTask(task.id, task.completed));
                deleteBtn.addEventListener("click", () => deleteTask(task.id, task));
                taskList.appendChild(card);
            });
        }
        updateProgressBar();
    }

    // --- Toggle Complete/Undo ---
    function toggleTask(id, completed) {
        tasksDocRef.doc(id).update({ completed: !completed }).then(() => {
            showSnackbar(completed ? "Task marked as active." : "Task completed!");
        }).catch((err) => showSnackbar(err.message, true));
    }

    // --- Delete Task (with Undo) ---
    function deleteTask(id, taskObj) {
        lastDeletedTask = taskObj;
        lastDeletedTaskId = id;
        tasksDocRef.doc(id).delete().then(() => {
            showSnackbar("Task deleted. <button class='btn btn-link btn-sm p-0 m-0' id='undo-btn'>Undo</button>", false, true);
            setTimeout(() => {
                const undoBtn = document.getElementById("undo-btn");
                if (undoBtn) {
                    undoBtn.onclick = undoDelete;
                }
            }, 100);
        }).catch((err) => showSnackbar(err.message, true));
    }
    function undoDelete() {
        if (lastDeletedTask && lastDeletedTaskId) {
            const { id, ...taskData } = lastDeletedTask;
            tasksDocRef.add(taskData).then(() => {
                showSnackbar("Task restored.");
                lastDeletedTask = null;
                lastDeletedTaskId = null;
            });
        }
    }

    // --- Progress Bar ---
    function updateProgressBar() {
        const completedCount = tasks.filter((t) => t.completed).length;
        const totalCount = tasks.length;
        const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
        progressBar.style.width = percent + "%";
        progressBar.setAttribute("aria-valuenow", percent);
        progressBar.textContent = `${completedCount} / ${totalCount} (${percent}%)`;
    }

    // --- Snackbar ---
    function showSnackbar(message, isError = false, html = false) {
        snackbar.className = "snackbar show" + (isError ? " bg-danger text-white" : "");
        if (html) {
            snackbar.innerHTML = message;
        } else {
            snackbar.textContent = message;
        }
        setTimeout(() => {
            snackbar.className = "snackbar";
            snackbar.innerHTML = "";
        }, 3500);
    }
}); 