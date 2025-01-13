
#  Firebase To-Do App

A responsive, minimalist To-Do application built with HTML, CSS, JavaScript, Bootstrap, Flatpickr, and Firebase. This app supports light/dark themes, real-time updates, and a clean user interface optimized for both desktop and mobile devices.

## Features

- **User Authentication:** Sign up, sign in, and sign out functionality using Firebase Authentication.
- **Real-Time Sync:** Tasks are synchronized with Firebase Firestore in real-time.
- **Responsive Design:** Fully responsive layout using Bootstrap to support desktops, tablets, and phones.
- **Minimalist Themes:** Clean light and dark mode themes with a focus on readability and usability.
- **Task Management:** 
  - Add, delete, and complete tasks.
  - Set deadlines using an integrated date and time picker (Flatpickr).
  - Flashing red gradient for overdue tasks to draw attention.
  - Collapsible list for completed tasks to keep the interface uncluttered.
- **Offline Persistence:** Local caching of tasks with Firebase offline persistence.
- **Performance Improvements:** 
  - Efficient DOM updates using `DocumentFragment`.
  - Real-time Firestore listeners (`onSnapshot`) for smooth data handling.
  - Debounced inputs for future optimizations.

## Technologies Used

- **Frontend:** HTML5, CSS3 (with CSS variables and media queries), JavaScript (ES6+)
- **Libraries & Frameworks:**
  - [Bootstrap 5](https://getbootstrap.com/) for responsive UI components.
  - [Flatpickr](https://flatpickr.js.org/) for a modern date and time picker.
  - [Firebase](https://firebase.google.com/) for backend services (Authentication, Firestore, Service Workers).
- **Version Control:** Git, with the repository hosted on GitHub.

## Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ChaturnaK/Firebase-To-do-List-PWA.git
   cd Firebase-To-do-List-PWA
   ```

2. **Configure Firebase:**
   - Create a Firebase project at [Firebase Console](https://console.firebase.google.com/).
   - Enable Authentication (Email/Password) and Firestore.
   - Copy your Firebase configuration and replace the placeholder in `script.js`:
     ```javascript
     const firebaseConfig = {
       // Paste your Firebase config here
     };
     ```
   
3. **Run the application:**
   - Simply open `index.html` in your browser or host it using a local development server.

## Usage

- **Sign Up / Sign In:** Create an account or log in with existing credentials.
- **Add a Task:** Click the "Add New Task" button, fill in the details, set a deadline if needed, and save.
- **Manage Tasks:** 
  - Mark tasks as complete/incomplete.
  - Delete tasks.
  - Expand the "Show Completed Tasks" section to view completed tasks.
- **Toggle Theme:** Use the dark mode toggle button in the navbar to switch between light and dark themes. The theme preference is saved and persists across sessions.

## Responsiveness

- The layout adapts to various screen sizes using Bootstrap’s grid system.
- On small devices, the modal for adding tasks becomes fullscreen for ease of use.
- Media queries adjust font sizes and button paddings on smaller screens to enhance readability.

## Contributing

Contributions are welcome! Feel free to fork this repository, make improvements, and submit pull requests. Please ensure that your code adheres to the project's style and guidelines.

## License

This project is open-source and available under the [MIT License](LICENSE).

## Acknowledgments

- [Bootstrap](https://getbootstrap.com/) for responsive UI components.
- [Flatpickr](https://flatpickr.js.org/) for the date and time picker.
- [Firebase](https://firebase.google.com/) for backend services and real-time data synchronization.
