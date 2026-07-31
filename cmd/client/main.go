package main

import (
	"fmt"
	"image/color"
	"strings"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"securechat/internal/audio"
	"securechat/internal/client"
)

const appTitle = "ChatApp"

func main() {
	defer audio.Terminate()

	a := app.NewWithID("securechat.golang")
	a.Settings().SetTheme(&chatTheme{})
	w := a.NewWindow(appTitle)
	w.Resize(fyne.NewSize(780, 560))
	w.SetFixedSize(true)

	if icon, err := fyne.LoadResourceFromPath("icons8-chat-48.png"); err == nil {
		w.SetIcon(icon)
	}

	addrEntry := widget.NewEntry()
	addrEntry.SetPlaceHolder("127.0.0.1:9090")
	addrEntry.SetText("127.0.0.1:9090")

	nameEntry := widget.NewEntry()
	nameEntry.SetPlaceHolder("Your name")

	keyEntry := widget.NewPasswordEntry()
	keyEntry.SetPlaceHolder("Shared encryption key")

	chatLog := widget.NewMultiLineEntry()
	chatLog.Wrapping = fyne.TextWrapWord
	chatLog.Disable()

	msgEntry := widget.NewEntry()
	msgEntry.SetPlaceHolder("Type a message…")

	status := canvas.NewText("Disconnected", color.NRGBA{R: 120, G: 120, B: 120, A: 255})
	status.TextSize = 12

	appendChat := func(line string) {
		fyne.Do(func() {
			cur := chatLog.Text
			if cur != "" && !strings.HasSuffix(cur, "\n") {
				cur += "\n"
			}
			chatLog.SetText(cur + line + "\n")
			chatLog.CursorRow = strings.Count(chatLog.Text, "\n")
		})
	}

	setStatus := func(text string, connected bool) {
		fyne.Do(func() {
			status.Text = text
			if connected {
				status.Color = color.NRGBA{R: 30, G: 140, B: 80, A: 255}
				w.SetTitle(fmt.Sprintf("%s Connected %s", appTitle, addrEntry.Text))
			} else {
				status.Color = color.NRGBA{R: 120, G: 120, B: 120, A: 255}
				w.SetTitle(appTitle + " Disconnected")
			}
			status.Refresh()
		})
	}

	var c *client.Client
	var micBtn, speakerBtn *widget.Button
	var connectBtn, disconnectBtn *widget.Button

	resetMediaButtons := func() {
		micBtn.Importance = widget.LowImportance
		micBtn.SetText("Mic Off")
		speakerBtn.Importance = widget.LowImportance
		speakerBtn.SetText("Speaker Off")
	}

	c = client.New(client.Handlers{
		OnText: func(from, text string) {
			ts := time.Now().Format("03:04:05 PM")
			appendChat(fmt.Sprintf("[%s]<%s> %s", ts, from, text))
		},
		OnDisconnect: func(reason string) {
			setStatus("Disconnected", false)
			fyne.Do(resetMediaButtons)
			appendChat(fmt.Sprintf("[system] connection closed: %s", reason))
		},
		OnStatus: func(msg string) {
			appendChat("[system] " + msg)
		},
	})

	sendMessage := func() {
		text := strings.TrimSpace(msgEntry.Text)
		if text == "" {
			return
		}
		if err := c.SendText(text); err != nil {
			dialog.ShowError(err, w)
			return
		}
		ts := time.Now().Format("03:04:05 PM")
		appendChat(fmt.Sprintf("[%s]<You> %s", ts, text))
		msgEntry.SetText("")
	}
	msgEntry.OnSubmitted = func(string) { sendMessage() }

	connectBtn = widget.NewButton("Connect", func() {
		addr := strings.TrimSpace(addrEntry.Text)
		name := strings.TrimSpace(nameEntry.Text)
		key := keyEntry.Text
		if addr == "" || name == "" || key == "" {
			dialog.ShowInformation("Missing fields", "IP:PORT, Name, and Encryption Key are required.", w)
			return
		}
		if err := c.Connect(addr, name, key); err != nil {
			dialog.ShowError(err, w)
			return
		}
		setStatus("Connected to "+addr, true)
	})
	connectBtn.Importance = widget.HighImportance

	disconnectBtn = widget.NewButton("Disconnect", func() {
		c.Disconnect()
		resetMediaButtons()
		setStatus("Disconnected", false)
	})

	micBtn = widget.NewButton("Mic Off", func() {
		if c.Recording() {
			c.StopMic()
			micBtn.Importance = widget.LowImportance
			micBtn.SetText("Mic Off")
			return
		}
		if err := c.StartMic(); err != nil {
			dialog.ShowError(err, w)
			return
		}
		micBtn.Importance = widget.DangerImportance
		micBtn.SetText("Mic On")
	})

	speakerBtn = widget.NewButton("Speaker Off", func() {
		if c.Playing() {
			c.StopSpeaker()
			speakerBtn.Importance = widget.LowImportance
			speakerBtn.SetText("Speaker Off")
			return
		}
		if err := c.StartSpeaker(); err != nil {
			dialog.ShowError(err, w)
			return
		}
		speakerBtn.Importance = widget.SuccessImportance
		speakerBtn.SetText("Speaker On")
	})

	sendBtn := widget.NewButton("Send", sendMessage)
	sendBtn.Importance = widget.HighImportance

	form := container.NewGridWithColumns(4,
		labeled("IP:PORT", addrEntry),
		labeled("Name", nameEntry),
		labeled("Encryption Key", keyEntry),
		container.NewVBox(
			widget.NewLabel(" "),
			container.NewHBox(connectBtn, disconnectBtn),
		),
	)

	mediaRow := container.NewHBox(micBtn, speakerBtn, layout.NewSpacer(), status)
	inputRow := container.NewBorder(nil, nil, widget.NewLabel("Message:"), sendBtn, msgEntry)

	content := container.NewBorder(
		container.NewVBox(form, widget.NewSeparator(), mediaRow),
		inputRow,
		nil,
		nil,
		container.NewScroll(chatLog),
	)

	w.SetContent(container.NewPadded(content))
	w.SetCloseIntercept(func() {
		c.Disconnect()
		audio.Terminate()
		w.Close()
	})
	w.ShowAndRun()
}

func labeled(title string, w fyne.CanvasObject) fyne.CanvasObject {
	return container.NewVBox(widget.NewLabel(title), w)
}

// chatTheme keeps a simple light theme without default purple accents.
type chatTheme struct{}

func (t *chatTheme) Color(n fyne.ThemeColorName, v fyne.ThemeVariant) color.Color {
	switch n {
	case theme.ColorNamePrimary:
		return color.NRGBA{R: 20, G: 110, B: 170, A: 255}
	case theme.ColorNameBackground:
		return color.NRGBA{R: 248, G: 249, B: 251, A: 255}
	case theme.ColorNameButton:
		return color.NRGBA{R: 230, G: 236, B: 242, A: 255}
	default:
		return theme.DefaultTheme().Color(n, v)
	}
}

func (t *chatTheme) Font(s fyne.TextStyle) fyne.Resource {
	return theme.DefaultTheme().Font(s)
}

func (t *chatTheme) Icon(n fyne.ThemeIconName) fyne.Resource {
	return theme.DefaultTheme().Icon(n)
}

func (t *chatTheme) Size(n fyne.ThemeSizeName) float32 {
	return theme.DefaultTheme().Size(n)
}

