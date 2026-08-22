import requests
import json

API_URL = ""

def chat_with_agent():
    # Initializes a simple terminal-based interface for testing conversational flow
    print("=== Cinnamon Agronomy Agent Terminal ===")
    print("Type 'exit' or 'quit' to end the session.\n")
    
    # Stores the ongoing conversation so the language model remembers previous questions and answers
    chat_history = []
    
    while True:
        user_message = input("You: ")
        
        # Provides a clean exit mechanism to break the chat loop
        if user_message.lower() in ['exit', 'quit']:
            print("Ending session.")
            break
            
        # Packages the new message alongside historical context to match the server's expected request schema
        payload = {
            "message": user_message,
            "chat_history": chat_history
        }
        
        print("Waiting for agent")
        
        try:
            # Sends the data to the cloud endpoint, halting execution after 60 seconds to prevent infinite hanging
            response = requests.post(API_URL, json=payload, timeout=60)
            
            # Intercepts standard web errors like a 500 Internal Server Error before attempting to parse JSON
            if response.status_code != 200:
                print(f"Server Error (HTTP {response.status_code})")
                print(f"Raw Server Response: {response.text}\n")
                continue

            response_data = response.json()
            
            # Extracts the agent's reply upon success and appends the exchange to the local memory array
            if response_data.get("status") == "success":
                agent_reply = response_data["response"]
                print(f"Agent:\n{agent_reply}\n")
                print("-" * 40)
                
                chat_history.append({"role": "user", "content": user_message})
                chat_history.append({"role": "assistant", "content": agent_reply})
            else:
                print(f"API Error: {response_data}\n")
                
        except requests.exceptions.Timeout:
            print("Request timed out! The server took longer than 60 seconds to respond.\n")
        except Exception as e:
            print(f"Network/System request failed: {str(e)}\n")

if __name__ == "__main__":
    chat_with_agent()