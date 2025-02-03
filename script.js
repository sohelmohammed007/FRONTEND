document.addEventListener('DOMContentLoaded', () => {
  const welcomeOverlay = document.getElementById('welcome-overlay');
  const user = JSON.parse(sessionStorage.getItem('user'));
  const notificationSound = document.getElementById('notification-sound');

  if (!user) {
    window.location.href = 'login.html';
    return;
  }

  setTimeout(() => {
    welcomeOverlay.classList.add('animate__fadeOut');
    setTimeout(() => {
      welcomeOverlay.style.display = 'none';
    }, 1000);
  }, 2000);

  // Update the URL to connect to the backend
  const socket = io('https://backennd-production.up.railway.app', {
    transports: ['websocket'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    console.log('Connected to server');
  });

  socket.on('connect_error', (error) => {
    console.error('Connection error:', error);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected after', attemptNumber, 'attempts');
  });

  const username = user.username;
  socket.emit('userConnected', username);

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type} animate__animated animate__fadeInDown`;
    toast.innerHTML = `
      <div class="toast-content">
        <i class="fas ${type === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle'}"></i>
        <span>${message}</span>
      </div>
    `;
    document.getElementById('toast-container').appendChild(toast);

    setTimeout(() => {
      toast.classList.replace('animate__fadeInDown', 'animate__fadeOutUp');
      setTimeout(() => toast.remove(), 1000);
    }, 3000);
  }

  const logoutBtn = document.getElementById('logout-btn');
  const searchInput = document.getElementById('search-input');
  const userList = document.getElementById('user-list');
  const friendRequestsList = document.getElementById('friend-requests');
  const friendsDot = document.getElementById('friends-dot');
  const requestsDot = document.getElementById('requests-dot');

  logoutBtn.addEventListener('click', async () => {
    try {
      socket.emit('logout', username);

      // Update the logout API call to use the backend URL
      const response = await fetch('https://backennd-production.up.railway.app/api/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username }),
      });

      if (!response.ok) {
        throw new Error('Logout failed');
      }

      document.querySelectorAll('.chat-popup').forEach(popup => popup.remove());
      sessionStorage.removeItem('user');

      showToast('Logged out successfully', 'success');

      setTimeout(() => {
        window.location.href = 'login.html';
      }, 1000);

    } catch (error) {
      console.error('Logout error:', error);
      showToast('Error during logout. Redirecting...', 'error');
      sessionStorage.removeItem('user');
      window.location.href = 'login.html';
    }
  });

  searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim();
    if (query) {
      socket.emit('searchUsers', query);
    } else {
      userList.innerHTML = '';
    }
  });

  function openChatPopup(friendName) {
    let existingPopup = document.querySelector(`.chat-popup[data-friend="${friendName}"]`);
    if (existingPopup) {
      existingPopup.classList.remove('hidden');
      return;
    }

    const chatPopupTemplate = document.getElementById('chat-popup-template');
    const chatPopup = chatPopupTemplate.cloneNode(true);
    chatPopup.id = '';
    chatPopup.classList.remove('hidden');
    chatPopup.setAttribute('data-friend', friendName);
    chatPopup.querySelector('.chat-popup-name').textContent = friendName;

    const room = [username, friendName].sort().join('-');
    socket.emit('joinRoom', room);

    const popupSendBtn = chatPopup.querySelector('.popup-send-btn');
    const popupMessageInput = chatPopup.querySelector('.popup-message');
    const popupChatBox = chatPopup.querySelector('.chat-popup-box');
    const closePopupBtn = chatPopup.querySelector('.close-popup-btn');

    closePopupBtn.addEventListener('click', () => {
      document.body.removeChild(chatPopup);
      socket.emit('leaveRoom', room);
    });

    function sendMessage() {
      const message = popupMessageInput.value.trim();
      if (message) {
        const timestamp = new Date().toISOString();
        socket.emit('sendMessage', { room, message, sender: username, timestamp });
        console.log('Message sent:', { room, message, sender: username, timestamp });
        popupMessageInput.value = '';
      }
    }

    popupSendBtn.addEventListener('click', sendMessage);
    popupMessageInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });

    socket.on(`receiveMessage-${room}`, (data) => {
      console.log('Message received:', data);
      appendMessage(popupChatBox, data);
      const messageBtn = document.querySelector(`.message-btn[data-friend="${data.sender}"]`);
      if (messageBtn) {
        showMessageNotificationDot(messageBtn);
      }
      playNotificationSound();
    });

    document.body.appendChild(chatPopup);

    socket.emit('getChatHistory', room, (messages) => {
      messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      popupChatBox.innerHTML = '';
      messages.forEach((message) => appendMessage(popupChatBox, message));
    });
  }

  socket.on('searchResults', (results) => {
    userList.innerHTML = '';
    if (results.length > 0) {
      results.forEach(({ username, status, isFriend, sentRequest }) => {
        if (username !== user.username) {
          const li = document.createElement('li');
          li.className = 'user-item flex justify-between items-center p-3 border-b border-gray-300';

          const userInfo = document.createElement('div');
          userInfo.className = 'user-info flex items-center space-x-3';
          userInfo.innerHTML = `
            <span class="username">${username}</span>
            ${status === 'online' ? '<span class="status-dot bg-green-500"></span>' : '<span class="status-dot bg-gray-400"></span>'}
          `;

          li.appendChild(userInfo);

          const actions = document.createElement('div');
          actions.className = 'actions flex space-x-2';

          if (!isFriend && !sentRequest) {
            const addButton = document.createElement('button');
            addButton.className = 'add-btn bg-blue-500 text-white px-3 py-1 rounded-lg hover:bg-blue-600 transition-colors duration-300';
            addButton.textContent = 'Add';
            addButton.addEventListener('click', () => {
              console.log(`Sending friend request from ${user.username} to ${username}`);
              socket.emit('sendFriendRequest', { from: user.username, to: username });
              addButton.textContent = 'Request Sent';
              addButton.disabled = true;
            });

            actions.appendChild(addButton);
          } else if (sentRequest) {
            const requestSentButton = document.createElement('button');
            requestSentButton.className = 'request-sent-btn bg-gray-500 text-white px-3 py-1 rounded-lg cursor-not-allowed';
            requestSentButton.textContent = 'Request Sent';
            requestSentButton.disabled = true;

            actions.appendChild(requestSentButton);
          } else {
            const messageButton = document.createElement('button');
            messageButton.className = 'message-btn bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 transition-colors duration-300 relative';
            messageButton.textContent = 'Message';
            messageButton.setAttribute('data-friend', username);
            messageButton.addEventListener('click', () => {
              openChatPopup(username);
              hideMessageNotificationDot(messageButton);
            });

            const unfriendButton = document.createElement('button');
            unfriendButton.className = 'unfriend-btn bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition-colors duration-300';
            unfriendButton.textContent = 'Unfriend';
            unfriendButton.addEventListener('click', () => {
              socket.emit('unfriend', { from: user.username, to: username });
            });

            actions.appendChild(messageButton);
            actions.appendChild(unfriendButton);
          }

          li.appendChild(actions);
          userList.appendChild(li);
        }
      });
    } else {
      const noUsers = document.createElement('li');
      noUsers.innerHTML = 'No users found';
      noUsers.className = 'no-users p-3 text-center text-gray-500';
      userList.appendChild(noUsers);
    }
  });

  socket.on('friendRequestReceived', ({ from }) => {
    const li = document.createElement('li');
    li.className = 'request-item flex justify-between items-center p-3 border-b border-gray-300';
    li.innerHTML = `
      <span>${from}</span>
      <div class="actions flex space-x-2">
        <button class="accept-btn bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 transition-colors duration-300">Accept</button>
      </div>
    `;
    li.querySelector('.accept-btn').addEventListener('click', () => {
      socket.emit('acceptFriendRequest', { from, to: username });
      friendRequestsList.removeChild(li);
      requestsDot.classList.add('hidden');  // Hide notification dot when checking requests
      updateUserList();
    });
    friendRequestsList.appendChild(li);
    requestsDot.classList.remove('hidden');  // Show notification dot for new friend request
  });

  socket.on('friendRequestAccepted', ({ from }) => {
    showToast(`You are now friends with ${from}`, 'success');
    updateUserList();
  });

  socket.on('friendListUpdated', updateUserList);

  socket.on('messageNotification', ({ from }) => {
    const messageBtn = document.querySelector(`.message-btn[data-friend="${from}"]`);
    if (messageBtn) {
      showMessageNotificationDot(messageBtn);
      friendsDot.classList.remove('hidden');  // Show notification dot for new message
    }
    playNotificationSound();
  });

  function updateUserList() {
    socket.emit('getUserFriends', { username: user.username }, (friends) => {
      userList.innerHTML = '';
      friends.forEach(({ username, status }) => {
        if (username !== user.username) {
          const li = document.createElement('li');
          li.className = 'user-item flex justify-between items-center p-3 border-b border-gray-300';

          const userInfo = document.createElement('div');
          userInfo.className = 'user-info flex items-center space-x-3';
          userInfo.innerHTML = `
            <span class="username">${username}</span>
            ${status === 'online' ? '<span class="status-dot bg-green-500"></span>' : '<span class="status-dot bg-gray-400"></span>'}
          `;

          li.appendChild(userInfo);

          const actions = document.createElement('div');
          actions.className = 'actions flex space-x-2';

          const messageButton = document.createElement('button');
          messageButton.className = 'message-btn bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 transition-colors duration-300 relative';
          messageButton.textContent = 'Message';
          messageButton.setAttribute('data-friend', username);
          messageButton.addEventListener('click', () => {
            openChatPopup(username);
            hideMessageNotificationDot(messageButton);
          });

          const unfriendButton = document.createElement('button');
          unfriendButton.className = 'unfriend-btn bg-red-500 text-white px-3 py-1 rounded-lg hover:bg-red-600 transition-colors duration-300';
          unfriendButton.textContent = 'Unfriend';
          unfriendButton.addEventListener('click', () => {
            socket.emit('unfriend', { from: user.username, to: username });
          });

          actions.appendChild(messageButton);
          actions.appendChild(unfriendButton);

          li.appendChild(actions);
          userList.appendChild(li);
        }
      });

      // Update friend requests list
      socket.emit('getFriendRequests', { username: user.username }, (requests) => {
        friendRequestsList.innerHTML = '';
        requests.forEach(request => {
          const li = document.createElement('li');
          li.className = 'request-item flex justify-between items-center p-3 border-b border-gray-300';
          li.innerHTML = `
            <span>${request}</span>
            <div class="actions flex space-x-2">
              <button class="accept-btn bg-green-500 text-white px-3 py-1 rounded-lg hover:bg-green-600 transition-colors duration-300">Accept</button>
            </div>
          `;
          li.querySelector('.accept-btn').addEventListener('click', () => {
            socket.emit('acceptFriendRequest', { from: request, to: username });
            friendRequestsList.removeChild(li);
            requestsDot.classList.add('hidden');  // Hide notification dot when checking requests
            updateUserList();
          });
          friendRequestsList.appendChild(li);
        });

        // Show the requests dot if there are any requests
        if (requests.length > 0) {
          requestsDot.classList.remove('hidden');
        } else {
          requestsDot.classList.add('hidden');
        }
      });
    });
  }

  document.querySelectorAll('.tab-btn').forEach(tabBtn => {
    tabBtn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      tabBtn.classList.add('active');
      const tab = tabBtn.getAttribute('data-tab');
      if (tab === 'friends') {
        document.getElementById('user-list').classList.remove('hidden');
        document.getElementById('friend-requests').classList.add('hidden');
        friendsDot.classList.add('hidden');  // Hide notification dot when checking friends tab
      } else {
        document.getElementById('user-list').classList.add('hidden');
        document.getElementById('friend-requests').classList.remove('hidden');
        requestsDot.classList.add('hidden');  // Hide notification dot when checking requests tab
      }
    });
  });

  updateUserList();
});

function formatDate(date) {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  return date.toLocaleDateString(undefined, options);
}

function appendMessage(container, { sender, message, timestamp }) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'message';
  const currentUser = JSON.parse(sessionStorage.getItem('user')).username;
  messageDiv.classList.add(sender === currentUser ? 'sent' : 'received');
  messageDiv.innerHTML = `
    <div class="message-text">${message}</div>
    <small>${new Date(timestamp).toLocaleTimeString()}</small>
  `;
  container.appendChild(messageDiv);
  container.scrollTop = container.scrollHeight;
}

function showMessageNotificationDot(button) {
  const notificationDot = document.createElement('span');
  notificationDot.className = 'notification-dot absolute top-0 right-0 w-3 h-3 bg-red-500 rounded-full';
  button.appendChild(notificationDot);
}

function hideMessageNotificationDot(button) {
  const notificationDot = button.querySelector('.notification-dot');
  if (notificationDot) {
    notificationDot.remove();
  }
}

function receiveMessage(message) {
  const chatMessages = document.querySelector('.chat-messages');
  const newMessage = document.createElement('div');
  newMessage.className = 'message received';
  newMessage.textContent = message;
  chatMessages.appendChild(newMessage);

  chatMessages.scrollTop = chatMessages.scrollHeight;

  showMessageNotificationDot();
}

document.querySelector('.tab-btn[data-tab="messages"]').addEventListener('click', hideMessageNotificationDot);

setTimeout(() => {
  receiveMessage('Hello! This is a new message.');
}, 5000);

function playNotificationSound() {
  const notificationSound = document.getElementById('notification-sound');
  console.log('Playing notification sound'); // Debug log
  notificationSound.play().catch(error => {
    console.error('Error playing notification sound:', error);
  });
}