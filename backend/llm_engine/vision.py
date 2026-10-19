import os
import json
import re
from openai import OpenAI

def extract_data_from_image(base64_image: str) -> dict:
    client = OpenAI(
        api_key=os.environ.get("GROQ_API_KEY"),
        base_url="https://api.groq.com/openai/v1"
    )

    prompt = """Analyze this soil test report or agricultural document. 
    Extract any of the following 6 variables if they explicitly exist. Accept any units or formats provided in the image:
    - "soil_ph" (number)
    - "rainfall_mm_year" (number)
    - "elevation_m" (number)
    - "age_years" (number)
    - "spacing" (string, e.g., '1.5 m x 1.5 m' or '4x3_ft')
    - "season" (string)
    
    Output ONLY a raw, valid JSON object containing the keys you found. Do not include markdown blocks, explanations, or any other text."""

    try:
        response = client.chat.completions.create(
            model="qwen/qwen3.8-27b",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{base64_image}"
                            }
                        }
                    ]
                }
            ],
            temperature=0.0,
            max_tokens=200
        )
        
        raw_output = response.choices[0].message.content.strip()
        print(f"Raw Vision LLM Output: {raw_output}") 
        
        match = re.search(r'\{.*\}', raw_output, re.DOTALL)
        if match:
            clean_json_str = match.group(0)
            return json.loads(clean_json_str)
        else:
            print("Regex failed to find JSON brackets in the output.")
            return {}
            
    except Exception as e:
        print(f"Vision Extraction Error: {e}")
        return {}