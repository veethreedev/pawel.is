// Check if the browser supports service workers
// if ('serviceWorker' in navigator) {
//   window.addEventListener('load', () => {
//     navigator.serviceWorker.register('javascript/sw.js') // Path to your sw.js file
//       .then(registration => {
//         console.log('SW registered: ', registration);
//       })
//       .catch(registrationError => {
//         console.log('SW registration failed: ', registrationError);
//       });
//   });
// }

const VERSION  = 1.4
const GREETING = "Hello"

function on_mobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isNumber(str) {
    return !isNaN(Number(str)) && str.trim() !== '';
}

// Random average
function random(min, max) {
    return Math.random() * (max - min) + min;
  }
  
function rndAvg(total, items, difference) {
	total = parseFloat( total )

	// console.log( total, items, difference )
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
            // ["random average", "history", "CH"],
            // [ "history" ],
            ["c", "*", "-5", "<"],
            ["7", "8", "9", "/"],
            ["4", "5", "6", "+"],
            ["1", "2", "3", "-"],
            ["0", ".", "="]
        ]
        let button = '<button id="key_ID" type="button" class="COLOR fs-1 p-4 btn btn-dark btn-block btn-lg border border-dark">TEXT</button>'

        let keypad_html = "<div id='key_pad' class='bg-dark p-0'>"
        let row_id = 0
        for (let y=0; y < layout.length; y++) {
            let row = layout[y]
            keypad_html = keypad_html + '<div class="row p-0"><div id="row_' + row_id + '" class="btn-group p-0" role="group aria-label="keypad">'
            for (let x=0; x < row.length; x++) {
                let id = row[x].replace(" ", "_")
				let color = "text-light"
				if ( row[x] == "<" || row[x] == "c" ) {
					color = "text-danger"
				}
                keypad_html = keypad_html + button.replace("TEXT", row[x]).replace("ID", id).replace("COLOR", color)
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
        $("#list").append('<li class="display-3 list_item list-group-item bg-dark text-light border-light">' + list[i] + '</li>')
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
	let current_input = ""

	let screen = $("#screen_text")
	let comment = $("#screen_comment")

    generate_key_pad()
	print_comment( GREETING )

	$("#screen_text, button").css({
		"touch-action": "manipulation",
		"user-select": "none",
		"-webkit-user-select": "none"
	});

    // Disabling some buttons
    // $("#key_random_average").attr("disabled", true)
    //$("#key_history").attr("disabled", true)
    //$("#key_CH").attr("disabled", true)

    // Click events
  //   $("#history").click(function( e ) {
		// e.preventDefault()
		// hide_keypad()
		// hide_screen()
		// show_list(get_history())
  //   })
    // $("#list").click(function() {
    //     hide_list()
    //     show_keypad()
    //     show_screen()
    //     clear_screen()
    // })

    // $("#back").click(function() {
    //     hide_list()
    //     show_keypad()
    //     show_screen()
    //     clear_screen()
    // })

	// $( "#screen_text" ).each( function() {
		$( "#screen_text" ).on( "click", function( e ) {
			e.preventDefault()
			e.stopPropagation()
			if ( random_average ) { return }
			let screen = $("#screen_text")

            if( isNumber( screen.text() ) ) {
                comment.text("Enter items:")
                total = screen.text()
                clear_screen()
                random_average = true
            }
		} )
	// } )

    $("button").on( "click", function() {
		let key = $(this)

        if (key.text() == "c") {
            clear_screen()
			print_comment(" ")
			current_input = ""
        } else if (key.text() == "<") {
			current_input = current_input.slice( 0, -1 )
			// print_screen( current_input )
            screen.text(screen.text().substring(0, screen.text().length - 1))
		} else if ( key.text() == "-5" ) {
			if ( isNumber( screen.text() ) ) {
				print_screen( screen.text() - 5 )
			}
        } else if (key.text() == "=") {
            if (random_average) {
                if ( isNumber( screen.text() )) {
					if ( screen.text() > 100 ) {
						print_comment( "Too many items!" )
						random_average = false
						clear_screen()
						return
					}
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
						print_comment( formula )
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
            comment.text("")
        } else {
            $("#screen_text").text(screen.text() + key.text())
            // comment.text("")
        }
    })
})
