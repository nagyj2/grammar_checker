// JupyterLab extension parts
import {
	JupyterFrontEnd,
	JupyterFrontEndPlugin
} from '@jupyterlab/application';

// Allow for settings to be loaded and saved
import { ISettingRegistry } from '@jupyterlab/settingregistry';

// Toolbar button class
import { ToolbarButton } from '@jupyterlab/apputils';

// Register with the Document registry to allow creation of widgets
// https://jupyterlab.readthedocs.io/en/stable/extension/documents.html#document-registry
import { DocumentRegistry } from '@jupyterlab/docregistry';

// Notebook manipulation
import {
	NotebookPanel,
	INotebookModel,
	INotebookTools,
} from '@jupyterlab/notebook';

// Allows widgets to be destroyed
import { IDisposable, DisposableDelegate } from '@lumino/disposable';

// For type annotations
// import { Cell } from '@jupyterlab/cells';
import { CodeMirrorEditor } from '@jupyterlab/codemirror';
// import { TextMarker, CodeMirror } from 'codemirror';
import * as CM from 'codemirror'; // needed b/c apparently typescript cannot import `CodeMirror`

// For throttling
import _ from 'lodash';

interface GrammarResponse{
	offset: number;
	errorLength: number;
	message: string;
}

// Global enable for the extension
var enabled = true;
// Tracking cells to their text markers
var errorMarks: Map<CodeMirrorEditor, CM.TextMarker[]> = new Map();

function clearErrorMarks(editor: CodeMirrorEditor) {
	// Wipe out all the old errors for the cell
	errorMarks.get(editor)?.forEach((mark: CM.TextMarker) => {
		console.log('clear!');
		mark.clear();
	});
}

function clearAllErrorMarks() {
	// Wipe out all errors for all cells
	errorMarks.forEach((marks: CM.TextMarker[]) => {
		marks.forEach((mark: CM.TextMarker) => {
			console.log('clear!');
			mark.clear();
		})
	});
}

// Create a POST request on the text inside the markdown cell
function checkGrammar(editor: CodeMirrorEditor) {
	if (enabled === false) {
		console.log("Grammar checker is disabled.");
		return;
	}

	// Get editor and clear cells associated with the editor
	// var editor = cell.editor as CodeMirrorEditor;
	clearErrorMarks(editor);

	
	var text;
	try { // The JupyterLab and on-change callback editors are different. Get text according to the type of input
		text = editor.model.value.text;
		console.log("Model:")
		console.log(editor)
	} catch (e) {
		console.log("Children:")
		console.log(editor)
		text = (editor as any).getValue();
	}

	console.log(text);

	// if (editor.hasOwnProperty('model')) {
	// 	console.log("JupyterLab:");
	// 	console.log(editor);
	// 	text = editor.doc.getValue();
	// } else {
	// 	console.log("Callback:");
	// 	console.log(editor);
	// 	text = editor.model.value.text;
	// }

	fetch('http://localhost:5000/check', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ markdown: text })
	}).then((reply: Response) => {
		reply.json().then((data: GrammarResponse[]) => {
			data.forEach((error: GrammarResponse) => {
				// console.log(error);
				
				// Find where the error is
				var start;
				var end;
				try {
					start = editor.doc.posFromIndex(error.offset); // get objs with `line` and `ch` (column) info that markText needs
					end = editor.doc.posFromIndex(error.offset + error.errorLength);
				} catch (e) { // Again, JupyterLab initial is different from callback?
					start = (editor as any).cm.doc.posFromIndex(error.offset);
					end = (editor as any).cm.doc.posFromIndex(error.offset + error.errorLength);
				}

				// Determine the class (for styling) to add to the error message
				var errorType = error.message.search('spelling') == -1 ? 'grammar-error' : 'spelling-error';
				// Apply the error style to the text
				errorMarks.get(editor as any)?.push(editor.doc.markText(start, end, {
					attributes: { 'data-text': '(' + error.message + ')' },
					className: 'error-tooltip ' + errorType
				}));
			})
		})
	});
}

// Notebook widget extension which adds a new button to the toolbar
export class ButtonExtension implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel> {
	createNew(
		panel: NotebookPanel,
		context: DocumentRegistry.IContext<INotebookModel>
	): IDisposable {
		const toggleChecker = () => {
			enabled = !enabled;
			// If turning off, clear all error marks and reset map
			if (!enabled) {
				clearAllErrorMarks();
				errorMarks = new Map();
			}
		};

		const bToggle = new ToolbarButton({
			className: 'grammar-check-button',
			label: 'Toggle',
			icon: 'fa-check',
			onClick: toggleChecker,
			tooltip: 'Toggles the grammar checker',
		});

		panel.toolbar.insertItem(10, 'toggleGrammar', bToggle);
		return new DisposableDelegate(() => {
			bToggle.dispose();
		});
	}
}

/**
 * Initialization data for the grammar_checker extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
	id: 'grammar_checker:plugin',
	autoStart: true,
	requires: [INotebookTools],
	optional: [ISettingRegistry],
	activate: (app: JupyterFrontEnd, notebook: INotebookTools, settingRegistry: ISettingRegistry | null) => {
		console.log('JupyterLab extension grammar_checker is activated!');

		if (settingRegistry) {
			settingRegistry
				.load(plugin.id)
				.then(settings => {
					console.log('grammar_checker settings loaded:', settings.composite);
				})
				.catch(reason => {
					console.error('Failed to load settings for grammar_checker.', reason);
				});
		}

		// setTimeout cannot take args, so checkCells cannot have any arguments - use closure to access panel
		function checkActiveCell() {
			const REFRESH_MS = 1000;

			console.log(errorMarks);

			// Cell to check. If possible, get Cell[]
			var cell /* Cell */ = notebook.activeCell;
			
			// If no active cell, reschedule and return
			if (!cell || cell.model.type !== 'markdown') {
				console.log(`Skipping active cell (type ${cell?.model.type}).`);
				setTimeout(checkActiveCell, REFRESH_MS);
				return;
			}
			
			// Get the editor managing the cell
			var editor = cell.editor as CodeMirrorEditor;
			editor = (editor.doc as any).cm;
			if (!errorMarks.has(editor)) {
				// Need to cast to get full access to the codemirror methods
				// https://stackoverflow.com/questions/67626233/how-can-i-get-a-reference-to-a-codemirror-instance-in-jupyterlab
				errorMarks.set(editor, []); // Add entry for cell
				
				// Check grammar for the current cell
				// console.log("Checking active cell.");
				// checkGrammar(editor);
				
				editor.doc.on("change", _.throttle(
					ed => { checkGrammar(ed); }, 300, // ed is the editor when a change occurs
					{ leading: false, trailing: true }
				));
			}

			// Set a throttled version of the checker to run whenever the cell is changed
			// Not really applicable if using only active cell
			//! Uses global `errorMarks`, so if we set this to many cells it will get messed up
			// Used in reference implementation to attach a checker to each cell

			// Set timeout
			setTimeout(checkActiveCell, REFRESH_MS);
		}

		// Start process of checking cells
		checkActiveCell();

		// Add button to the toolbar
		app.docRegistry.addWidgetExtension('Notebook', new ButtonExtension());
	}
};

export default plugin;
