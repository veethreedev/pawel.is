// Registering service worker
// if ("serviceWorker" in navigator) {
//     navigator.serviceWorker.register("static/sw.js").then(registration => {
//         console.log("SW Registered")
//         console.log(registration)
//     }).catch(error => {
//         console.log("SW Registration failed")
//         console.log(error)
//     })
// }

const VERSION = 1.3

function on_mobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Random average
function random(min, max) {
    return Math.random() * (max - min) + min;
  }
  
function rndAvg(total, items, difference) {
    let list = []
    let average = total / items

    //First stage
    let sum = 0
    for (let i=0; i<items; i++) {
        list[i] = Math.floor(average + random(-difference, difference))
        sum += list[i]
    }
    
    // Second stage
    let error = total - sum
    let averageError = error / items
    sum = 0
    for (let i=0; i<items; i++) {
        list[i] += averageError
        sum += list[i]

        error = error - averageError
        if (Math.floor(error) == 0) {
            break
        }
    }

    // rounding
    sum = 0
    for (let i=0; i<items; i++) {
        list[i] = Math.floor(list[i])
        sum += list[i]
    }
    
    // One final test, if theres a remainder, It gets added to a random item
    if (sum != total) {
        list[0] += (total - sum)
    }
    
    return list
}

// Generates the keypad. No real reason to do it like this apart
// from it being easier to change the layout.
function generate_key_pad() {
    if ($("#key_pad").length < 1) {
        let layout = [
            ["random average", "history", "CH"],
            ["c", "*", "<"],
            ["7", "8", "9", "/"],
            ["4", "5", "6", "+"],
            ["1", "2", "3", "-"],
            ["0", ".", "="]
        ]
        let button = '<button id="key_ID" type="button" class="p-4 btn btn-dark btn-block btn-lg border border-dark">TEXT</button>'

        let keypad_html = "<div id='key_pad' class='bg-dark p-0'>"
        let row_id = 0
        for (let y=0; y < layout.length; y++) {
            let row = layout[y]
            keypad_html = keypad_html + '<div class="row p-0"><div id="row_' + row_id + '" class="btn-group p-0" role="group aria-label="keypad">'
            for (let x=0; x < row.length; x++) {
                let id = row[x].replace(" ", "_")
                keypad_html = keypad_html + button.replace("TEXT", row[x]).replace("ID", id)
            }
            row_id += 1
            keypad_html = keypad_html +  '</div></div>'
        }
        keypad_html = keypad_html + "</div>"

        $("#main_container").append(keypad_html)
        $("#row_0 > button").removeClass("p-3")
        $("#row_0 > button").addClass("p-0")
    }
}

// History
function add_history(content) {
    sessionStorage.setItem(sessionStorage.length, content)
}

function clear_history() {
    sessionStorage.clear()
}

function get_history() {
    let list = []
    for (let i=0; i<sessionStorage.length; i++) {
        list[i] = sessionStorage.getItem(i)
    }
    return list
}

// Screen
function print_screen(text) {
    $("#screen_text").text(text)
}

function print_comment(text) {
    $("#screen_comment").text(text)
}

function clear_screen() {
    $("#screen_text").text("")
}

function hide_screen() {
    $("#screen").addClass("d-none")
}

function show_screen() {
    $("#screen").removeClass("d-none")
}

// List toggle
function show_list(list) {
    if (list.length < 1) {
        list[0] = "Nothing to see here..."
    } 
    for (let i=list.length - 1; i>=0; i--) {
        $("#list").append('<li class="list_item list-group-item bg-dark text-light border-light">' + list[i] + '</li>')
    }
    $("#back").removeClass("d-none")
}

function hide_list() {
    $(".list_item").remove()
    $("#back").addClass("d-none")

}

// Keypad toggle
function hide_keypad() {
    $("#key_pad").addClass("d-none")
}

function show_keypad() {
    $("#key_pad").removeClass("d-none")
}

$(document).ready(function() {
    // RNDAVG GLOBALS
    let random_average = false
    let total = 0
    let items = 0

    generate_key_pad()

	print_comment( "Culator v" + VERSION )

    // Disabling some buttons
    // $("#key_random_average").attr("disabled", true)
    //$("#key_history").attr("disabled", true)
    //$("#key_CH").attr("disabled", true)

    // Click events
    $("#list").click(function() {
        hide_list()
        show_keypad()
        show_screen()
        clear_screen()
    })

    // $("#back").click(function() {
    //     hide_list()
    //     show_keypad()
    //     show_screen()
    //     clear_screen()
    // })

    $("button").click(function() {
        let key = $(this)
        let screen = $("#screen_text")
        let comment = $("#screen_comment")

        if (key.text() == "c") {
            clear_screen()
        } else if (key.text() == "<") {
            screen.text(screen.text().substring(0, screen.text().length - 1))
        } else if (key.text() == "=") {
            if (random_average) {
                if (screen.text().length > 0) {
                    random_average = false
                    items = screen.text()
                    hide_keypad()
                    hide_screen()
                    show_list(rndAvg(total, items, 40))
                }
            } else {
                let ok = false
                let formula = ""
                let result = ""
                try {
                    formula = screen.text()
                    result = eval(screen.text())
                    ok = true
                } catch {
                    result = "Invalid input"
                }
                if (ok) {
                    if (screen.text().length > 0) {
                        print_screen(result)
                        add_history(formula + "=" + result)
                    }
                }
            }
        } else if (key.text() == "random average") {
            if(screen.text().length > 0) {
                comment.text("Enter items:")
                total = screen.text() 
                clear_screen()
                random_average = true
            } else {
                comment.text("Enter a total value first!")
            }
        } else if (key.text() == "history") {
            hide_keypad()
            hide_screen()
            show_list(get_history())
        } else if (key.text() == "CH") {
            clear_history()
            print_comment("History cleared.")
        } else if (key.text() == "Back") {
            hide_list()
            show_keypad()
            show_screen()
            clear_screen()
        } else {
            $("#screen_text").text(screen.text() + key.text())
            comment.text("")
        }
    })
})



