# Secure Chat Application

This is a client-server chat application built with Python that supports text and voice messaging with end-to-end encryption.

## Features

*   **Text Messaging:** Send and receive text messages in real-time.
*   **Voice Messaging:** Send and receive voice messages.
*   **End-to-End Encryption:** Messages are encrypted using Fernet symmetric encryption, ensuring that only the sender and recipient can read them. The encryption key is provided by the user.
*   **Graphical User Interface (GUI):** The client has a user-friendly GUI built with `tkinter`.
*   **Cross-Platform:** Runs on any system with Python installed.

## Technologies Used

*   **Python 3:** Core programming language.
*   **Tkinter:** For the client's graphical user interface.
*   **Sockets (`socket` module):** For network communication between the client and server.
*   **Cryptography (`cryptography` library):** For end-to-end encryption of messages.
*   **PyAudio (`pyaudio` library):** For recording and playing voice messages.
*   **Threading (`threading` module):** To handle multiple client connections and background tasks concurrently.

## How to Run

1.  **Prerequisites:**
    *   Python 3 installed.
    *   The following Python libraries installed:
        *   `cryptography`
        *   `pyaudio`
        *   `tk` (usually comes with Python, but ensure it's available)

    You can install the necessary libraries using pip:
    ```bash
    pip install cryptography pyaudio
    ```
    *(Note: PyAudio may have system-level dependencies like `portaudio`. Please refer to the PyAudio documentation for installation instructions specific to your operating system.)*

2.  **Start the Server:**
    Open a terminal or command prompt and run the server script:
    ```bash
    python Server.py
    ```
    The server will start listening on `0.0.0.0:9090` by default. You should see a log message indicating the server has started.

3.  **Start the Client:**
    Open another terminal or command prompt and run the client script:
    ```bash
    python Client.py
    ```
    The client GUI will open.

4.  **Connect:**
    *   In the client GUI, enter the server's IP address and port (e.g., `localhost:9090` if running on the same machine, or the server's IP address if on a different machine).
    *   Enter your desired name.
    *   Enter an encryption key. **This key must be the same for all clients who wish to communicate securely.**
    *   Click "Connect".

## Client Interface

The client application provides a graphical interface with the following components:

*   **IP:PORT Field:** Enter the IP address and port number of the chat server (e.g., `127.0.0.1:9090`).
*   **Name Field:** Enter your display name for the chat.
*   **Encryption Key Field:** Enter a secret key for encrypting and decrypting messages. All users in a chat session must use the same key.
*   **Connect Button:** Click to connect to the server with the provided details.
*   **Disconnect Button:** Click to disconnect from the server.
*   **Speaker Toggle Button (Headphone Icon):**
    *   **Off (Flat):** Voice messages received will not be played. This is the default state.
    *   **On (Sunken):** Enables playback of incoming voice messages. Click to toggle.
*   **Microphone Toggle Button (Microphone Icon):**
    *   **Off (Flat):** Microphone is off. You cannot send voice messages. This is the default state.
    *   **On (Sunken):** Activates the microphone for recording. Click to toggle. While active, spoken audio is sent as voice messages.
*   **Message Display Area:** Shows incoming and outgoing messages, along with timestamps and sender names.
*   **Message Input Field:** Type your text messages here.
*   **Send Button:** Click to send the typed text message. You can also press Enter in the message input field.

## Server

*   **Host and Port:** By default, the server listens on `0.0.0.0` (all available network interfaces) and port `9090`. This can be changed in the `Server.py` script if needed.
*   **Multiple Clients:** The server can handle connections from multiple clients simultaneously.
*   **Message Relaying:** It receives messages (both text and voice) from one client and relays them to all other connected clients in the same chat session (i.e., those who connected using the same encryption key, though the server itself doesn't enforce key matching for relaying, message decryption will fail on clients with mismatched keys).
*   **Voice Streaming Management:** The server manages which clients are currently "listening" for voice messages (speaker toggle enabled on the client) and only forwards voice data to those clients.
*   **Logging:** Server events, such as connections, disconnections, and startup, are logged to a file named `all.log` in the same directory as the server script. This logging can be helpful for debugging.

## Icons

The client interface uses icons for the speaker and microphone toggle buttons. These icons are from [Icons8](https://icons8.com).
*   `icons8-chat-48.png`: Used as the application window icon.
*   The speaker and microphone button icons are embedded as base64 strings within `Client.py`.

## Encryption Details

The application implements end-to-end encryption for messages using symmetric key cryptography:

*   **Library:** The `cryptography` library, specifically its `Fernet` implementation, is used.
*   **Key Derivation:** The user-provided "Encryption Key" in the client GUI is used as the basis for the actual encryption key. This input key is padded or truncated to ensure it's 32 bytes long, then base64 encoded to be suitable for `Fernet`.
    ```python
    # Simplified client-side key handling for Fernet
    # key_input = "user_provided_key"
    # fernet_key = base64.b64encode(f'{key_input:<32}'[:32].encode())
    # cipher_suite = Fernet(fernet_key)
    ```
*   **Process:**
    1.  When a client sends a message (text or voice), it first encrypts the message content using the derived Fernet key.
    2.  The encrypted message is sent to the server.
    3.  The server relays this encrypted message to other clients without attempting to decrypt it.
    4.  Receiving clients use the same derived Fernet key (from their own input of the shared secret key) to decrypt the message.
*   **Security:** This ensures that the server, or anyone intercepting the traffic between clients and the server, cannot read the message content if they do not possess the secret key. The security relies on all legitimate users keeping the "Encryption Key" confidential and identical.
