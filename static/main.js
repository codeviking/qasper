// Minimum number of questions to write.
var MIN_QUESTIONS = 1;  //Let's use a small value for now to make it easy to test
// The number of passages available to the user.
var NUM_PASSAGES = 10;

// Keeps track of whether we're editing a question, and what that question is.
var editing_question = null;

// Keeps track of the index of the current passage (1-indexed).
var currentPassageIndex = 0;
// Keeps track of the total number of questions written.
var total_question_cnt = 0;
// Keeps track of the number of questions written per passage
var question_num = {};
// An array of passages that the user is writing questions about.
var passages = [];
// IDs of the passages above.
var passage_ids = [];

var current_question_id = "";
var annotations = {};
var global_timeout = null;

document.addEventListener("DOMContentLoaded", function() {
    // Initialize question and passage counters
    $('#numQuestionsWritten').text("0");
    $('#passageNum').text("1/" + NUM_PASSAGES);
    // Fetch and load passages
    fetchPassagesWithRetries(3);
    check_question_count();
});

function deleteQuestion(question_to_delete) {
    // Get the card of the question to edit
    var question_card_to_delete = question_to_delete.parentElement.parentElement;
    // Get the id of the question to delete
    var question_card_to_delete_id = question_card_to_delete.id;

    // Delete the question card and remove its annotation
    question_card_to_delete.remove();
    delete annotations[question_card_to_delete_id];

    // Decrement the id of questions answers with IDs higher than the one to delete.
    var startId = parseInt(question_card_to_delete_id.replace(currentPassageIndex + "-question-", ""));
    var endId = $('#questionsWritten').find('.questionCard').length + 1;

    for (var i = startId + 1; i < endId; i++) {
        $("#" + currentPassageIndex + "-question-" + i).prop("id", currentPassageIndex + "-question-" + (i-1));
        $("#" + currentPassageIndex + "-question-" + i + "-text").prop("id", currentPassageIndex + "-question-" + (i-1) + "-text");
        annotations[currentPassageIndex + "-question-" + (i-1)] = annotations[currentPassageIndex + "-question-" + i];
        delete annotations[currentPassageIndex + "-question-" + i];
    }
    total_question_cnt -= 1;
    question_num[currentPassageIndex] -= 1;
    $("#numQuestionsWritten").text(total_question_cnt);
}

// Edit an already added QA pair
function modify_previous_question(question_to_edit) {
    $("#next_question").text("Re-submit Question");

    // Get the card of the question to edit
    var editing_question_card = question_to_edit.parentElement.parentElement;
    // Get the id of the question to edit
    editing_question = editing_question_card.id;

    var editing_question_annotation = annotations[editing_question];
    var question_text = editing_question_annotation.question;


    // Fill in the input question box with the the already-written question.
    $("#input-question").val(question_text);
}

function create_question_card(question_id) {
    $('#questionsWritten').append('<div class="card mt-2 questionCard" id="' + question_id + '">' +
                                  '<div class="card-body">' +
                                  '<p class="card-text" id="' + question_id + '-text"></p>' +
                                  '<button class="btn btn-primary mr-2" onclick="modify_previous_question(this); return false;">Edit</button>' +
                                  '<button class="btn btn-danger" onclick="deleteQuestion(this); return false;">Delete</button>' +
                                  '</div>' +
                                  '</div>');
}

// Store user background information
function select_change() {
    var entry_id = currentPassageIndex + '-user';
    annotations[entry_id] = {
        user_paper_read: $("#user_paper_read").val(),
        user_paper_topic_background: $("#user_paper_topic_background").val()
    };
}
// Reset element when previous/next passages control is selected
function populateSelect(passageIndex) {
    var entry_id = passageIndex + '-user';
    if (entry_id in annotations) {
        entry = annotations[entry_id];
        $("#user_paper_read").val(entry.user_paper_read),
        $("#user_paper_topic_background").val(entry.user_paper_topic_background)
    }
}

// Store the question and its answer(s) in a structured form.
function create_question() {
   run_validations_question();
    var annotation = {
        question: $("#input-question").val(),
        passageID: passage_ids[currentPassageIndex]
    };

    // create the text for the bottom rectangle container containing questions
    var qaText = "Q: " +
            annotation.question;

    // If the new_tab_id already exists in annotations, question is being edited,
    // so we have to change the text of the card and increment the associated counters.
    // If the new_tab_id doesn't already exist in annotations, the question is new,
    // so we have to create the card before we modify its text.
    if (editing_question == null) {
        // Initialize counter of number of passages for the question if it
        // hasn't been used yet.
        if (!question_num.hasOwnProperty(currentPassageIndex)) {
            question_num[currentPassageIndex] = 0;
        }
        var new_tab_id = currentPassageIndex + '-question-' + question_num[currentPassageIndex];
        create_question_card(new_tab_id);

        total_question_cnt += 1;
        question_num[currentPassageIndex] += 1;
        $("#numQuestionsWritten").text(total_question_cnt);
    }
    else {
        var new_tab_id = editing_question;
    }

    // Modify the text of the question card
    $('#' + new_tab_id + '-text').text(qaText);

    // Store the annotation, regardless if editing or not.
    annotations[new_tab_id] = annotation;

    resetQuestionEntry();
    check_question_count();
}

function resetQuestionEntry() {
    $("#input-question").val("");
    $("#error_panel").text("");

    // Reset editing_question.
    editing_question = null;
    $("#next_question").text("Add Question");
    $("#next_question").prop("disabled", true);	
}

function checkIfQuestionCanBeSubmitted() {
    if (isQuestionEmpty()) {
      $("#next_question").prop("disabled", true);	
    } else {
      $("#next_question").prop("disabled", false);	
    }
}

function isQuestionEmpty() {
    var trimmedQuestion = $.trim($("#input-question").val());

    if (trimmedQuestion.length === 0) {
        return true;
    }
    return false;
}

function isQuestionDuplicate() {
    var trimmedQuestion = $.trim($("#input-question").val());

    for (var questionId in annotations) {
        // If we are editing a question, we need not compare the question with itself.
        // If we are not editing a question, editing_question will be null anyway.
        if (questionId == editing_question) {
            continue; 
        }
        if (questionId.startsWith(currentPassageIndex)) {
            if ($.trim(annotations[questionId].question) === trimmedQuestion) {
                return true;
            }
        }
    }
    return false;
}

// Run span checks whenever the predicted answer changes
function run_validations_question() {
    if (isQuestionDuplicate()) {
        $("#error_panel").text("This question is the same as an existing one!");
        $("#next_question").prop("disabled", true);
        return false;
    }
    // Enable submitting the question.
    $("#error_panel").text("");
    $("#next_question").prop("disabled", false);
    return true;
}

function nextPassage() {
    currentPassageIndex += 1;
    populatePassage(currentPassageIndex);
}

function previousPassage() {
    currentPassageIndex -= 1;
    populatePassage(currentPassageIndex);
}

// switch between next and previous passages
function populatePassage(passageIndex) {
    if (passageIndex < passages.length) {
        // Remove contents of passage box.
        $("#passage").empty();
        // Reset the paper-specific user backgroup information
        $("#user_paper_read").val('na');
        $("#user_paper_topic_background").val('na');

        var passage_title = passages[passageIndex]["title"];
        var passage_text = passages[passageIndex]["abstract"];
        //var passage_citation = passages[passageIndex]["citation_contexts"].join("\n\n");
        // Change the text of the passage box.
        // We use innerText here (as opposed to jquery.text()) because we want
        // to preserve line breaks and the spaces that come with them.
        document.getElementById("title").innerText = passage_title;
        document.getElementById("abstract").innerText = passage_text;
        //document.getElementById("citationContext").innerText = passage_citation;
        // Remove the written questions and replace them with the questions
        // written for the passage we're changing to.
        populateQuestionsWritten(passageIndex);
        populateSelect(passageIndex)

        // Update the displayed passage number.
        $('#passageNum').text((passageIndex + 1) + "/" + NUM_PASSAGES);

        // Enable or disable next / previous passage buttons as necessary.
        reset_passage_buttons();
        // Reset the answer entry interface
        resetQuestionEntry();	
    }
}

function reset_passage_buttons() {
    if (currentPassageIndex < 1) {
        $("#prev_passage").prop("disabled", true);
    }
    else if (currentPassageIndex >= passages.length - 1) {
        $("#next_passage").prop("disabled", true);
    }
    else {
        $("#prev_passage").prop("disabled", false);
        $("#next_passage").prop("disabled", false);
    }
}

// Reset element when previous passages control is selected
function populateQuestionsWritten(passageIndex) {
    // Hide all of the currently visible questionCards
    var questionsWritten = $('#questionsWritten').find('.questionCard');
    for (var i = 0; i < questionsWritten.length; i++) {
        questionsWritten[i].remove();
    }
    // Iterate through questions written for passageIndex and
    // display them.
    for (var questionId in annotations) {
        if (questionId.startsWith(passageIndex)) {
            create_question_card(questionId);
            var qaText = "Q: " +
                    annotations[questionId].question;
            // Modify the text of the question card.
            $('#' + questionId + '-text').text(qaText);
        }
    }
}

function fetchPassagesWithRetries(n) {
    var data_url = "https://pradeepd-qasper.s3-us-west-2.amazonaws.com/arxiv_cscl/arxiv_cscl_abstracts.json";

    fetch(data_url)
        .then(parsePassages)
        .catch(function(error) {
            if (n === 1) return reject(loadErrorPassages);
            fetchPassagesWithRetries(n - 1)
                .then(parsePassages)
                .catch(loadErrorPassages);
        });
}

function parsePassages(response) {
    if (response.status !== 200) {
        console.log('Looks like there was a problem. Status Code: ' +
                    response.status);
        loadErrorPassages();
        return;
    }

    response.json().then(function(data) {
        var all_passage_ids = Object.keys(data);
        // Get NUM_PASSAGES random passages to show the user.
        for (var i = 0; i < NUM_PASSAGES; i++) {
            var idx = Math.floor((Math.random() * all_passage_ids.length) + 1);
            var passage_id = all_passage_ids[idx];
            passages.push(data[passage_id]);
            passage_ids[i] = passage_id;
        }
        currentPassageIndex = 0;
        populatePassage(currentPassageIndex);
    });
}

function loadErrorPassages() {
    var passage_data = "Error retrieving passages";
    passage_ids = [-1];
    passages = passage_data.split('\n');
    currentPassageIndex = 0;
    populatePassage(currentPassageIndex);
}

function check_question_count() {
    if (total_question_cnt < MIN_QUESTIONS) {
        // Button is disabled
        $("#ready_submit").prop("disabled", true);
        // Remove btn-success if it exists.
        if ($("#ready_submit").hasClass("btn-success")){
            $("#ready_submit").removeClass("btn-success");
        }
        // Add btn-secondary if it doesn't exist already
        if (!$("#ready_submit").hasClass("btn-secondary")){
            $("#ready_submit").addClass("btn-secondary");
        }
    } else {
        // Button is enabled
        $("#ready_submit").prop("disabled", false);
        // Remove btn-secondary if it exists
        if ($("#ready_submit").hasClass("btn-secondary")){
            $("#ready_submit").removeClass("btn-secondary");
        }
        // Add btn-success if it doesn't exist already
        if (!$("#ready_submit").hasClass("btn-success")){
            $("#ready_submit").addClass("btn-success");
        }
    }
}

function final_submit() {
    annotations['feedback'] = $('#feedback').val();
    var generatedAnswers = $('#generated_answers').val(JSON.stringify(annotations));
    $("#submission_container").show();
    var submitButton = $("#submitButton");
    submitButton.prop("disabled", false);
}
