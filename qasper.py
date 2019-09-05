from collections import defaultdict
import json
import hashlib
import os
from flask import Flask, request, send_from_directory

# set the project root directory as the static folder, you can set others.
app = Flask(__name__, static_url_path='')
SESSIONS_DIR = "./sessions"

@app.route('/')
def main():
    return send_from_directory('static', 'index.html')

@app.route('/submit', methods=['POST'])
def submit():
    # TODO (pradeep): start a new HIT?
    # TODO (pradeep): Save session start and end times.
    write_to_file(request.form)
    return "<h1>Thank you! Your data has been recorded. You can close this window now.</h1>"

def write_to_file(form_data):
    user_background = form_data["user_nlp_background"]
    paper_input_data = json.loads(form_data["generated_answers"])
    paper_info = defaultdict(lambda: {"questions": []})
    feedback = None
    for key, value in paper_input_data.items():
        if key == "feedback":
            feedback = value
            continue
        local_paper_id = key.split("-")[0]
        if "-user" in key:
            # This is the user info about the paper
            paper_info[local_paper_id]["familiarity"] = value
        elif "-question" in key:
            # These are the actual questions
            paper_info[local_paper_id]["questions"].append(value["question"])
            paper_info[local_paper_id]["paper_id"] = value["passageID"]

    output_data = {"data": list(paper_info.values()),
                   "feedback": feedback}
    session_id = hashlib.sha1(str(output_data).encode()).hexdigest()
    if not os.path.exists(SESSIONS_DIR):
        os.makedirs(SESSIONS_DIR)
    output_file = os.path.join(SESSIONS_DIR, f"{session_id}.json")
    json.dump(output_data, open(output_file, "w"), indent=2)

@app.route('/static/<path:path>')
def send_js(path):
    return send_from_directory('static', path)

if __name__ == "__main__":
    app.run()
