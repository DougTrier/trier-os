<!-- Copyright © 2026 Trier OS. All Rights Reserved. -->

# Trier OS Pilot Guide

**For plant managers, maintenance managers, operations directors, and plant leaders.**

This guide answers the five questions you should ask before putting any software on your floor.

---

## 1. What problem does it solve?

Your techs know what needs to be done. Your problem is that the information to support them — machine history, open permits, the right procedure, parts on hand — lives in a dozen different places. Clipboards. Spreadsheets. Someone's head.

When a machine goes down, a tech walks to it, has no context, and starts from scratch every time.

Trier OS changes that to this: the tech scans a QR tag on the machine. In one tap, they see the machine's current state, any open work orders, active safety permits, and the next action they're supposed to take. They execute. The system records what happened. They move on.

No typing. No logging in to three systems. No calling the office to ask who worked on this machine last week.

That is the core promise: **scan a machine, know its state, execute the next action, keep working even when the network is down, and prove what happened.**

---

## 2. What does it replace?

Trier OS is a direct replacement for the things that are almost certainly already failing you:

- **Paper-based maintenance logs** — work request pads, completed job folders, binders of PM history
- **Spreadsheet work order tracking** — the shared Excel file that two people accidentally overwrite, or that only one person actually knows how to use
- **Whiteboard job boards** — great for a standup, useless for history or accountability
- **Disconnected safety checklists** — paper LOTO logs, PDF permit forms that get filed and forgotten

It also replaces or reduces the need for bolt-on point solutions — standalone permit-to-work tools, separate contractor tracking systems, disconnected inspection apps — because all of that is built in.

---

## 3. What does it NOT replace?

Trier OS is not an ERP. It does not touch:

- **General ledger or accounting** — no financial modules, no cost center management at the GL level
- **Payroll** — labor hours flow through Trier OS for work orders, but payroll processing stays in your HR system
- **ERP financial workflows** — purchasing approvals, accounts payable, invoice processing

If you run SAP, Oracle, or another ERP, Trier OS sits alongside it. Your ERP handles money. Trier OS handles the floor. The two systems can exchange data, but neither one replaces the other.

If someone is telling you Trier OS will replace your ERP, they are wrong.

---

## 4. How do I try it safely?

The system ships with three demo accounts that give you a realistic picture of what each role sees. No production data. No risk. Nothing gets configured on your actual plant until you say so.

| Account | What it shows you |
|---|---|
| `ghost_admin` | Full plant administration — setup, user management, reporting |
| `ghost_tech` | The technician experience — scanning, work orders, safety permits |
| `ghost_exec` | Cross-plant analytics and dashboards — what leadership sees |

Log in with any of these accounts and use the system as aggressively as you want. Create work orders. Walk through a LOTO permit. Pull a quality inspection. Look at the maintenance backlog. None of it touches real data.

The install guide PDF is attached to the GitHub release page at [github.com/DougTrier/trier-os](https://github.com/DougTrier/trier-os). A standard pilot takes less than an hour to stand up on a local machine. You do not need a server room, a cloud subscription, or an IT department to try it.

---

## 5. What does day-one deployment look like?

Here is what actually happens when you decide to go live at a plant.

**Before day one:**
- Install Trier OS on one server at that plant — this can be a standard workstation, not dedicated server hardware
- Import or enter your asset list (machines, equipment, infrastructure)
- Print and apply QR tags to those assets — the system generates them
- Set up your user accounts and assign roles (tech, supervisor, manager)

**Day one on the floor:**
- Techs scan a machine, see their open work orders, and start working
- Safety permits (LOTO, PTW, MOC) are issued and tracked digitally from that point forward
- If the corporate network goes down, the desktop app keeps working locally and syncs when the connection restores — techs do not stop

**What you will not have on day one:**
- Years of historical data (that takes time to migrate if you want it)
- Predictive maintenance alerts (those build as the system collects run history)
- Custom reports (the standard dashboards cover most needs out of the box; custom reports take a few days of configuration)

The system is free and open source. There is no license fee, no per-seat charge, no renewal. What you pay for is your own time to set it up — and the install guide walks you through every step.

---

## Questions?

Open an issue on GitHub: [github.com/DougTrier/trier-os/issues](https://github.com/DougTrier/trier-os/issues)

If you have a question, someone else probably has the same one. Ask publicly so the answer is there for the next plant manager who finds this.
