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
    // Subtasks modal elements
    const subtasksSection = document.getElementById("subtasks-section");
    const subtaskInput = document.getElementById("subtask-input");
    const addSubtaskBtn = document.getElementById("add-subtask-btn");
    const subtasksList = document.getElementById("subtasks-list");

    let tasks = [];
    let tasksDocRef = null;
    let unsubscribeSnapshot = null;
    let currentFilter = "active";
    let lastDeletedTask = null;
    let lastDeletedTaskId = null;
    // Track expanded tasks by id
    let expandedTasks = new Set();

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
            // Set subtasks if present
            window.currentSubtasks = Array.isArray(task.subtasks) ? [...task.subtasks] : [];
        } else {
            taskTextInput.value = "";
            taskDeadlineInput.value = "";
            taskPriorityInput.value = "normal";
            taskIdInput.value = "";
            document.getElementById("taskModalLabel").textContent = "New Task";
            window.currentSubtasks = [];
        }
        fp.setDate(taskDeadlineInput.value || null, true);
        setTimeout(() => taskTextInput.focus(), 300);
        renderSubtasksModal();
        // TODO: Render subtasks UI in modal (next step)
        taskModal.show();
    }

    // --- Subtasks Modal Logic ---
    function renderSubtasksModal() {
        if (!subtasksList) return;
        subtasksList.innerHTML = "";
        // Sort: incomplete first, completed last
        window.currentSubtasks = [
            ...window.currentSubtasks.filter(st => !st.completed),
            ...window.currentSubtasks.filter(st => st.completed)
        ];
        (window.currentSubtasks || []).forEach((subtask, idx) => {
            const li = document.createElement("li");
            li.className = "list-group-item d-flex align-items-center justify-content-between";
            li.setAttribute("data-idx", idx);
            li.innerHTML = `
                <span class='drag-handle me-2' tabindex='0' aria-label='Drag to reorder' style='cursor: grab; font-size: 1.2em;'><i class="bi bi-list"></i></span>
                <div class="form-check flex-grow-1">
                    <input class="form-check-input" type="checkbox" id="subtask-check-${idx}" ${subtask.completed ? 'checked' : ''}>
                    <label class="form-check-label ${subtask.completed ? 'text-decoration-line-through text-muted' : ''}" for="subtask-check-${idx}">
                        ${subtask.text}
                    </label>
                </div>
                <button type="button" class="btn btn-sm btn-outline-danger ms-2" title="Delete subtask" aria-label="Delete subtask"><i class="bi bi-trash"></i></button>
            `;
            // Prevent drag on checkbox/label
            li.querySelector(".form-check-input").addEventListener("mousedown", e => e.stopPropagation());
            li.querySelector(".form-check-label").addEventListener("mousedown", e => e.stopPropagation());
            // Toggle complete
            li.querySelector(".form-check-input").addEventListener("change", (e) => {
                window.currentSubtasks[idx].completed = e.target.checked;
                // Resort: incomplete first, completed last
                window.currentSubtasks = [
                    ...window.currentSubtasks.filter(st => !st.completed),
                    ...window.currentSubtasks.filter(st => st.completed)
                ];
                renderSubtasksModal();
            });
            // Delete subtask
            li.querySelector(".btn-outline-danger").addEventListener("click", () => {
                window.currentSubtasks.splice(idx, 1);
                renderSubtasksModal();
            });
            subtasksList.appendChild(li);
        });
        // Enable SortableJS with drag handle
        if (window.subtasksSortable) window.subtasksSortable.destroy();
        window.subtasksSortable = Sortable.create(subtasksList, {
            animation: 150,
            handle: '.drag-handle',
            onEnd: function (evt) {
                if (evt.oldIndex !== evt.newIndex) {
                    const moved = window.currentSubtasks.splice(evt.oldIndex, 1)[0];
                    window.currentSubtasks.splice(evt.newIndex, 0, moved);
                    renderSubtasksModal();
                }
            }
        });
    }
    if (addSubtaskBtn && subtaskInput) {
        addSubtaskBtn.addEventListener("click", () => {
            const text = subtaskInput.value.trim();
            if (text) {
                window.currentSubtasks.push({ text, completed: false });
                subtaskInput.value = "";
                renderSubtasksModal();
            }
        });
        subtaskInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                addSubtaskBtn.click();
            }
        });
    }

    // --- Save Task (Add/Edit) ---
    taskForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = taskTextInput.value.trim();
        const deadlineVal = taskDeadlineInput.value.trim();
        const deadline = deadlineVal ? new Date(deadlineVal).toISOString() : null;
        const priority = taskPriorityInput.value;
        const id = taskIdInput.value;
        const subtasks = Array.isArray(window.currentSubtasks) ? window.currentSubtasks : [];
        // If all subtasks are completed, mark main task as completed
        const completed = subtasks.length > 0 ? subtasks.every(st => st.completed) : false;
        if (!text) return;
        const now = new Date().toISOString();
        if (id) {
            // Edit
            tasksDocRef.doc(id).update({ text, deadline, priority, subtasks, completed }).then(() => {
                showSnackbar("Task updated.");
                taskModal.hide();
            }).catch((err) => showSnackbar(err.message, true));
        } else {
            // Add
            const newTask = { text, addedDate: now, deadline, completed, priority, subtasks };
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

    // --- Debounce utility ---
    function debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
    // --- Throttle utility ---
    function throttle(fn, limit) {
        let inThrottle;
        return function (...args) {
            if (!inThrottle) {
                fn.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
    // --- Debounced Firestore update for subtasks ---
    const debouncedUpdateSubtasks = debounce((taskId, subtasks, completed) => {
        tasksDocRef.doc(taskId).update({ subtasks, completed });
    }, 200);
    // --- Render a single task card by id ---
    function renderTaskCard(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        // Remove old card
        const oldCard = document.querySelector(`[data-task-id='${taskId}']`);
        if (oldCard) oldCard.remove();
        // Render new card and insert in correct position
        const card = createTaskCard(task);
        // Insert in correct order
        const allCards = Array.from(taskList.children);
        let inserted = false;
        for (let i = 0; i < allCards.length; i++) {
            const otherId = allCards[i].getAttribute('data-task-id');
            const otherTask = tasks.find(t => t.id === otherId);
            if (otherTask && new Date(task.addedDate) > new Date(otherTask.addedDate)) {
                taskList.insertBefore(card, allCards[i]);
                inserted = true;
                break;
            }
        }
        if (!inserted) taskList.appendChild(card);
    }
    // --- Create a single task card (refactored from renderTasks) ---
    function createTaskCard(task) {
        const hasSubtasks = Array.isArray(task.subtasks) && task.subtasks.length > 0;
        const isExpanded = expandedTasks.has(task.id);
        const card = document.createElement("div");
        card.className = "task-card d-flex flex-column px-4 py-3" + (task.completed ? " completed" : "");
        card.style.marginBottom = "1rem";
        card.setAttribute('data-task-id', task.id);
        // Priority badge
        const priority = `<span class=\"task-priority ${task.priority || 'normal'}\">${(task.priority || 'normal').charAt(0).toUpperCase() + (task.priority || 'normal').slice(1)}</span>`;
        // Deadline
        let deadline = "<span class='text-muted'>No deadline</span>";
        if (task.deadline) {
            const d = new Date(task.deadline);
            deadline = `<span class='${!task.completed && d < now ? 'text-danger fw-bold' : 'text-muted'}'>${d.toLocaleString()}</span>`;
        }
        // Expand/collapse button
        let expandBtn = "";
        if (hasSubtasks) {
            expandBtn = `<button class='btn btn-sm btn-outline-secondary me-2' title='${isExpanded ? "Collapse" : "Expand"} subtasks' data-taskid='${task.id}'><i class='bi bi-${isExpanded ? "dash" : "plus"}-square'></i></button>`;
        }
        // Card inner HTML
        card.innerHTML = `
          <div class=\"d-flex flex-row align-items-center justify-content-between w-100\">
            <div class=\"d-flex align-items-center gap-3\">
              ${expandBtn}
              <span class=\"fw-bold task-title\">${task.text}</span>
              ${priority}
            </div>
            <div class=\"task-meta text-muted small d-flex flex-column flex-md-row gap-2\">
              <span><i class=\"bi bi-calendar-plus\"></i> ${new Date(task.addedDate).toLocaleString()}</span>
              <span><i class=\"bi bi-calendar-event\"></i> ${deadline}</span>
            </div>
            <div class=\"task-actions d-flex gap-2 ms-3\">
              <button class=\"btn btn-sm btn-outline-primary\" title=\"Edit\" aria-label=\"Edit task\"><i class=\"bi bi-pencil\"></i></button>
              <button class=\"btn btn-sm btn-outline-success\" title=\"${task.completed ? 'Undo' : 'Complete'}\" aria-label=\"${task.completed ? 'Undo' : 'Complete'}\"><i class=\"bi ${task.completed ? 'bi-arrow-counterclockwise' : 'bi-check2-circle'}\"></i></button>
              <button class=\"btn btn-sm btn-outline-danger\" title=\"Delete\" aria-label=\"Delete task\"><i class=\"bi bi-trash\"></i></button>
            </div>
          </div>
          <div class='subtasks-tree' style='${isExpanded && hasSubtasks ? '' : 'display:none;'}'></div>
          <div class='main-complete-lock-message' style='display:none; color:#dc3545; font-size:0.95em; margin-top:0.5em;'><i class="bi bi-lock-fill me-1"></i>Complete all subtasks to finish this task.</div>
        `;
        // Action buttons
        const [editBtn, completeBtn, deleteBtn] = card.querySelectorAll(".task-actions button");
        editBtn.addEventListener("click", () => openTaskModal(task));
        completeBtn.addEventListener("click", () => toggleTask(task.id, task.completed));
        deleteBtn.addEventListener("click", () => deleteTask(task.id, task));
        // Expand/collapse logic
        if (hasSubtasks) {
            const expandBtnElem = card.querySelector("button[title*='subtasks']");
            if (expandBtnElem) {
                expandBtnElem.addEventListener("click", () => {
                    if (expandedTasks.has(task.id)) {
                        expandedTasks.delete(task.id);
                    } else {
                        expandedTasks.add(task.id);
                    }
                    renderTasks();
                });
            }
        }
        // Render subtasks tree if expanded
        if (isExpanded && hasSubtasks) {
            const subtasksDiv = card.querySelector('.subtasks-tree');
            subtasksDiv.innerHTML = '';
            const ul = document.createElement('ul');
            ul.className = 'list-group list-group-flush';
            // Sort: incomplete first, completed last
            const sortedSubtasks = [
                ...task.subtasks.filter(st => !st.completed),
                ...task.subtasks.filter(st => st.completed)
            ];
            let dividerAdded = false;
            sortedSubtasks.forEach((sub, idx) => {
                // Divider for completed subtasks
                if (!dividerAdded && idx > 0 && sortedSubtasks[idx - 1].completed === false && sub.completed === true) {
                    const divider = document.createElement('li');
                    divider.className = 'list-group-item py-1 px-2 bg-light text-center border-0';
                    divider.style.fontSize = '0.9em';
                    divider.style.background = '#f8f9fa';
                    divider.innerHTML = '<span class="text-muted">Completed</span>';
                    ul.appendChild(divider);
                    dividerAdded = true;
                }
                const li = document.createElement('li');
                li.className = 'list-group-item d-flex align-items-center';
                li.setAttribute('data-idx', idx);
                if (sub.completed) li.style.background = '#f8f9fa';
                li.innerHTML = `
                    <span class='drag-handle me-2' tabindex='0' aria-label='Drag to reorder' style='cursor: grab; font-size: 1.2em;'><i class="bi bi-list"></i></span>
                    <input class='form-check-input me-2' type='checkbox' id='subtask-main-${task.id}-${idx}' ${sub.completed ? 'checked' : ''}>
                    <label class='form-check-label flex-grow-1 ${sub.completed ? 'text-decoration-line-through text-muted' : ''}' for='subtask-main-${task.id}-${idx}'>${sub.text}</label>
                `;
                // Prevent drag on checkbox/label
                li.querySelector('input[type="checkbox"]').addEventListener('mousedown', e => e.stopPropagation());
                li.querySelector('label').addEventListener('mousedown', e => e.stopPropagation());
                // Toggle subtask completion
                li.querySelector('input[type="checkbox"]').addEventListener('change', (e) => {
                    // Update in Firestore
                    const updatedSubtasks = [...task.subtasks];
                    // Find the real index in the original array
                    const realIdx = task.subtasks.findIndex((s, i) => s.text === sub.text && s.completed === sub.completed && i >= idx);
                    updatedSubtasks[realIdx] = { ...updatedSubtasks[realIdx], completed: e.target.checked };
                    // Resort: incomplete first, completed last
                    const resorted = [
                        ...updatedSubtasks.filter(st => !st.completed),
                        ...updatedSubtasks.filter(st => st.completed)
                    ];
                    // If all subtasks are completed, mark main task as completed; else, mark as active
                    const allDone = resorted.length > 0 && resorted.every(st => st.completed);
                    debouncedUpdateSubtasks(task.id, resorted, allDone);
                });
                ul.appendChild(li);
            });
            subtasksDiv.appendChild(ul);
            // Enable SortableJS for main list subtasks with drag handle
            const mainListSortable = Sortable.create(ul, {
                animation: 150,
                handle: '.drag-handle',
                onEnd: function (evt) {
                    if (evt.oldIndex !== evt.newIndex) {
                        const updatedSubtasks = [...task.subtasks];
                        // Only allow reordering within incomplete or completed sections
                        const incompleteCount = updatedSubtasks.filter(st => !st.completed).length;
                        const oldIsCompleted = sortedSubtasks[evt.oldIndex].completed;
                        const newIsCompleted = sortedSubtasks[evt.newIndex].completed;
                        // Prevent moving incomplete to completed section and vice versa
                        if (oldIsCompleted !== newIsCompleted) {
                            renderTasks(); // Revert the change
                            return;
                        }
                        // Find the real indices in the original array
                        const oldRealIdx = task.subtasks.findIndex((s, i) => s.text === sortedSubtasks[evt.oldIndex].text && s.completed === sortedSubtasks[evt.oldIndex].completed && i >= evt.oldIndex);
                        const newRealIdx = task.subtasks.findIndex((s, i) => s.text === sortedSubtasks[evt.newIndex].text && s.completed === sortedSubtasks[evt.newIndex].completed && i >= evt.newIndex);
                        if (oldRealIdx !== -1 && newRealIdx !== -1) {
                            const moved = updatedSubtasks.splice(oldRealIdx, 1)[0];
                            updatedSubtasks.splice(newRealIdx, 0, moved);
                            // Resort to maintain completed at bottom
                            const resorted = [
                                ...updatedSubtasks.filter(st => !st.completed),
                                ...updatedSubtasks.filter(st => st.completed)
                            ];
                            debouncedUpdateSubtasks(task.id, resorted, resorted.length > 0 && resorted.every(st => st.completed));
                        }
                    }
                }
            });
        }
        // Disable main task completion if there are incomplete subtasks
        const incompleteSubtasks = hasSubtasks ? task.subtasks.filter(st => !st.completed).length : 0;
        const lockMsg = card.querySelector('.main-complete-lock-message');
        if (hasSubtasks && incompleteSubtasks > 0) {
            completeBtn.disabled = true;
            completeBtn.title = `Complete all ${incompleteSubtasks} subtask${incompleteSubtasks > 1 ? 's' : ''} first`;
            completeBtn.classList.add('disabled');
            if (lockMsg) lockMsg.style.display = 'block';
        } else {
            completeBtn.disabled = false;
            completeBtn.title = task.completed ? 'Undo' : 'Complete';
            completeBtn.classList.remove('disabled');
            if (lockMsg) lockMsg.style.display = 'none';
        }
        // Accessibility: expand/collapse button
        if (hasSubtasks) {
            const expandBtnElem = card.querySelector("button[title*='subtasks']");
            if (expandBtnElem) {
                expandBtnElem.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
                expandBtnElem.setAttribute('aria-label', isExpanded ? 'Collapse subtasks' : 'Expand subtasks');
                expandBtnElem.style.minWidth = '2.5em';
                expandBtnElem.style.minHeight = '2.5em';
                expandBtnElem.style.fontSize = '1.3em';
                expandBtnElem.style.marginRight = '0.5em';
            }
        }
        return card;
    }
    // --- Refactor renderTasks to use DocumentFragment and only re-render changed cards ---
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
            const frag = document.createDocumentFragment();
            filtered.forEach((task) => {
                frag.appendChild(createTaskCard(task));
            });
            taskList.appendChild(frag);
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