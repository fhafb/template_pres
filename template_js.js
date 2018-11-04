/** Array of slides together with their characteristics
 *	Each element of the slide is an object with the following members:
 *	<dl>
 *		<dt>id</dt><dd>id of the slide</dd>
 *		<dt>numfragments</dt><dd>Number of fragments in the slide</dd>
 *	</dl>
 *	Additionnally, it may hold the following members:
 *	<dl>
 *		<dt>section</dt><dd>Name of the section, when the slide starts a new section (usually an outline slide)</dd>
 *	</dl>
 */
var slides=[];
/** Current slide number, relative to the slides array, 0 is first slide */
var curslide=0;
/** Current fragment number, 0 is first fragment */
var curfragment=0;
/** Tell if a hash change event is managed by the script or not */
var program_hashchange=false;
/** Tell if the user is browsing the overview */
var on_overview=false;
/** Current slide number on overview, relative to the slides array */
var overview_curslide;
/** Id of the notes window, null if not displayed */
var wnotes=null;
/** Touch event starting point x coordinate */
var xDown=null;
/** Touch event starting point y coordinate */
var yDown=null;
/** URL used for synchronization */
var syncUrl=null;
/** Name used for synchronization */
var syncName=null;
/** Slave mode */
var slaveMode=false;

/**
 * Look for the first object in the {@link slides} variable that stands for the slide with the given id
 * @param {string} Id - Id (DOM) of the searched slide
 * @returns First member of the {@link slides} variable matching the id
 */
function getSlideElement(slideid) {
	return slides.find(element => element['id']==slideid);
}

/**
 * Get the DOM element associated with the given index of the {@link slides} array
 * @param {number} num - Index in the array
 * @returns DOM element for the slide
 */
function getSlide(num) {
	return document.getElementById(slides[num]['id']);
}

/**
 * Look for the index of the first object in the {@link slides} variable that stands for the slide with the given id
 * @param {number} slideid - Id of the slide
 * @returns Index of the first member of the {@link slides} variable matching the id
 */
function getSlideIndex(slideid) {
	return slides.findIndex(element => element['id']==slideid);
}

/**
 * This function prepare the handling of fragments. It first parses the <tt>data-fragment</tt>, <tt>data-fstart</tt> and <tt>data-fanim</tt> attributes of objects. Then it counts the number of fragments of each slide and adds it to the {@link slides} array.
 */
function count_fragments() {
	for (let val of ['fragment','fanim','fstart']) {
		Array.from(document.querySelectorAll('[data-'+val+']')).forEach(function(element) {
			let attr=element.dataset[val];
			attr=attr.replace(/'/g,'"');
			element.dataset[val]=attr;
		});
	}
	Array.from(document.getElementsByTagName('section')).forEach(function(element) {
		if (element.dataset['numfragment']) getSlideElement(element.id)['numfragments']=parseInt(element.dataset["numfragment"]);
		else {
			let max=0;
			Array.from(element.querySelectorAll('[data-fragment]')).forEach(function(element) {
				let fragspec=JSON.parse(element.dataset["fragment"]);
				Object.getOwnPropertyNames(fragspec).forEach(function(fraglist) {
					let reg=/(?:^|,)(\d*)(?:-(\d*))?/g;
					while ((frag=reg.exec(fraglist))!==null) {
						let first=(frag[1]=='' ? 0 : parseInt(frag[1]));
						let last=(frag[2] && frag[2]!='') ? parseInt(frag[2]) : first;
						if (first>max) max=first;
						if (last>max) max=last;
					}
				});
			});
			getSlideElement(element.id)['numfragments']=max;
		}
	});
}

/**********************************
 *       Fragment functions       *
 **********************************/
/**
 * Test if the fragment num is included in the fragspec.
 * @param {string} fragspec - A string which specifies the fragments indexes for which the slide should be displayed. It is a sequence of elementary fragment specifications separated by commas. An elementary fragment sequence is either an individual index (number), either an interval (number-number).<br/>Example : "1,4-7,12".
 * @returns {boolean} True if the fragment with index num is included in the fragspec, false otherwise.
 */
function test_frag(fragspec,num) {
	let reg=/(?:^|,)(\d*)(?:-(\d*))?/g;
	let frag;
	while ((frag=reg.exec(fragspec))!==null) {
		let first=frag[1]=='' ? 0 : parseInt(frag[1]);
		let last=frag[2] ? (frag[2]=='' ? 10000 : parseInt(frag[2])) : first;
		if (num>=first && num<=last) return true;
	}
	return false;
}

/**
 * Toggle the starting styles to all the fragments of the slide. The starting style is given by adding the classes read from the <tt>data-fstart</tt> attribute.
 * @param {object} slide - DOM element for the slide
 * @param {boolean} on - If true, starting styles are applied. If false, they are removed
 */
function apply_start_fragments(slide,on) {
	Array.from(slide.querySelectorAll('[data-fstart]')).forEach(function(element) {
		let classes=JSON.parse(element.dataset["fstart"]);
		for (let cl of classes) if (on) element.classList.add(cl); else element.classList.remove(cl);
	});
}

/**
 * Apply a class to the objects of a slide according to whether their fragspec includes or not the fragment with index num.
 * If num is in the fragspec of the object, the matching class is added to the object. Otherwise, it is removed.
 * @param {object} slide - DOM element for the slide
 * @param {num} num - Fragment number
 */
function reset_fragments(slide,num) {
	Array.from(slide.querySelectorAll('[data-fragment]')).forEach(function(element) {
		let fragspec=JSON.parse(element.dataset["fragment"]);
		Object.getOwnPropertyNames(fragspec).forEach(function(fraglist) {
			if (test_frag(fraglist,num)) {
				fragspec[fraglist].forEach(function(val) {
					element.classList.add(val);
				});
			} else {
				fragspec[fraglist].forEach(function(val) {
					element.classList.remove(val);
				});
			}
		});
	}); 
}

/**
 * Animation for a fragment: this function only makes the fragment visible or not.
 * @param {object} element - DOM element to animate
 * @param {boolean} incoming - Direction of the animation
 */
function fragment_none(element,incoming) {
	if (incoming) element.style.visibility='visible'; else element.style.visibility='hidden';
}

/**
 * Animation for a fragment: this function starts the CSS animation for the fragment. It does so by cloning the object, putting it on the page and removing the old object.
 * @param {object} element - DOM element to animate
 * @param {boolean} incoming - Direction of the animation, not used
 */
function fragment_cssanim(element,incoming) {
	if (incoming) {
		let newelement=element.cloneNode(true);
		element.parentNode.replaceChild(newelement,element);
	}
}

/**
 * Apply an animation to a fragment. The animation function is read in the <tt>data-fanim</tt> attribute of the object.
 * @param {number} slidenum - Index of the slide in the {@link slides} array
 * @param {number} fragmentnum - Index of the fragment to animate
 * @param {boolean} incoming - Direction of the animation
 */
function animate_fragment(slidenum,fragmentnum,incoming) {
	Array.from(getSlide(slidenum).querySelectorAll('[data-fanim]')).forEach(function(element) {
		let fragspec=JSON.parse(element.dataset['fanim']);
		Object.getOwnPropertyNames(fragspec).forEach(function(fraglist) {
			if (test_frag(fraglist,fragmentnum)) {
				let fname=fragspec[fraglist];
				if (fname) window[fname](element,incoming);
			}
		});
	});
}

/**********************************
 *       Animation functions      *
 **********************************/
/**
 * Animation for a transition between two slides: this function only makes the new slide appear over the old one.
 * @param {object} source - DOM object for the old slide
 * @param {object} dest - DOM object for the new slide
 * @param {boolean} increasing - Direction of the animation
 * @param {function} callback - Callback function called when the animation ends
 */
function animate_none(source,dest,increasing,callback) {
	source.style.visibility=null;
	if (source.dataset["onhide"]) window[source.dataset["onhide"]](source);
	dest.style.visibility='visible';
	if (dest.dataset["onshow"]) window[dest.dataset["onshow"]](dest);
	program_hashchange=true;
	location.hash="#"+dest.id;
	dest.style.visibility=null;
	callback();
}

/**
 * Animation for a transition between two slides: this function applies CSS transitions.
 * The transition is applied by adding and removing classes to the slide, with names like 'anim-sweep-from', 'anim-sweep-to', 'anim-sweep-transitions' where 'sweep' is the name read from the name argument.
 * @param {object} source - DOM object for the old slide
 * @param {object} dest - DOM object for the new slide
 * @param {boolean} increasing - Direction of the animation
 * @param {function} callback - Callback function called when the animation ends
 * @param {string} name - Name of the animation
 */
function animate_css(source,dest,increasing,callback,name) {
	dest.classList.add(increasing ? ('anim-'+name+'-from') : ('anim-'+name+'-to'));
	// Timeouts are needed, otherwise the browser changes the order of the events
	setTimeout(function() {
		source.classList.add('anim-'+name+'-transitions');
		dest.classList.add('anim-'+name+'-transitions');
		let destfinish=false;
		let sourcefinish=false;
		// Callbacks at end of animations
		function destend(event) {
			//console.log('destend : destfinish='+destfinish+' source='+source.id+' dest='+dest.id);
			if (destfinish) return;
			destfinish=true;
			dest.removeEventListener('transitionend',destend);
			dest.classList.remove('anim-'+name+'-transitions');
			if (dest.dataset["onshow"]) window[dest.dataset["onshow"]](dest);
			program_hashchange=true;
			location.hash="#"+dest.id;
			dest.style.visibility=null;
			callback();
		}
		function sourceend(event) {
			//console.log('sourceend : sourcefinish='+sourcefinish+' source='+source.id+' dest='+dest.id);
			if (sourcefinish) return;
			sourcefinish=true;
			source.removeEventListener('transitionend',sourceend);
			source.classList.remove('anim-'+name+'-transitions');
			if (source.dataset["onhide"]) window[source.dataset["onhide"]](source);
			source.style.visibility=null;
			source.classList.remove(increasing ? ('anim-'+name+'-to') : ('anim-'+name+'-from'));
		}
		setTimeout(function() {
			// Set callbacks
			// Animation
			source.addEventListener("transitionend",sourceend);
			dest.addEventListener("transitionend",destend);
			setTimeout(function() {
				//console.log('animate : source='+source.id+' dest='+dest.id);
				dest.style.visibility='visible';
				source.classList.add(increasing ? ('anim-'+name+'-to') : ('anim-'+name+'-from'));
				dest.classList.remove(increasing ? ('anim-'+name+'-from') : ('anim-'+name+'-to'));
				setTimeout(function() {
					destend();
					sourceend();
				},1200);
			},20);
		},20);
	},20);
}

/**
 * Apply an animation to make a new slide appear over an old one. The animation is read from the <tt>data-animation</tt> attribute of the slide.
 * First a function name animate_name is searched in the global scope. If none is found, the function tries to animate the transition with the {@link animate_css} function, using the <tt>data-animation</tt> attribute as the name of the CSS animation.
 * @param {object} source - DOM object for the old slide
 * @param {object} dest - DOM object for the new slide
 * @param {boolean} increasing - Direction of the animation
 * @param {function} callback - Callback function called when the animation ends
 */
function apply_animation(source,dest,increasing,callback) {
	let fn=null;
	let name;
	if (dest.dataset["animation"]) fn=window[dest.dataset["animation"]]; else fn=animate_none;
	if (!fn) {
		name=dest.dataset["animation"];
		fn=animate_css;
	}
	if (dest.id==source.id) fn=animate_none;
	fn(source,dest,increasing,callback,name);
}

/**********************************
 *         Navigation bar         *
 **********************************/
/**
 * Add a navigation bar on top of all slides and populate it with sections and subsections as read from the presentation.
 * A new section is started by a slide with a <tt>data-section</tt> attribute. This attribute stands for the title of the new section.
 * A <tt>data-ssection</tt> attribute may be added to provide a short name for the title of the section. In that case, the short title is used in the navigation bar.
 * A new section is started by a slide with a <tt>data-subsection</tt> attribute. This attribute stands for the title of the new subsection.
 */
function add_navigation_bar() {
	let nav=document.createElement('nav');
	nav.setAttribute('id','minitoc');
	document.body.insertAdjacentElement('afterbegin',nav);
	let csection=null;
	let csubsection=null;
	Array.from(document.getElementsByClassName('slide')).forEach(function(element) {
		if (element.dataset['section']) {
			let sname=element.dataset['ssection'] ? element.dataset['ssection'] : element.dataset['section'];
			let newsection=document.createElement('div');
			newsection.classList.add('section');
			newsection.dataset['section']=element.dataset['section'];
			newsection.innerHTML='<div class="title">'+sname+'</div>';
			csection=document.createElement('div');
			csection.classList.add('slides');
			newsection.insertAdjacentElement('beforeend',csection);
			nav.insertAdjacentElement('beforeend',newsection);
			csubsection=null;
		}
		if (element.dataset['subsection']) {
			csubsection=document.createElement('span');
			csubsection.dataset['subsection']=element.dataset['subsection'];
			csection.insertAdjacentElement('beforeend',csubsection);
		}
		if (csubsection) csubsection.insertAdjacentHTML('beforeend','<a href="#'+element.id+'">&#x25cb;</a>');
		else if (csection) csection.insertAdjacentHTML('beforeend','<a href="#'+element.id+'">&#x25cb;</a>');
	});
}

/**
 * Update the navigation bar: the new slide is represented by a filled circle, the old slide is reverted to its original state. The section and subsection of the new slide also get new styles by adding the <tt>currentSection</tt> and <tt>currentSubsection</tt> classes to them.
 * @param {number} newslidenum - New slide index, relative to the {@link slides} array
 * @param {number} oldslidenum - Old slide index, relative to the {@link slides} array
 */
function update_navigation_bar(newslidenum,oldslidenum) {
	let link;
	let minitoc=document.getElementById('minitoc');
	Array.from(minitoc.getElementsByClassName('section')).forEach(element => element.classList.remove('currentSection'));
	Array.from(minitoc.getElementsByTagName('span')).forEach(element => element.classList.remove('currentSubsection'));
	if (oldslidenum) {
		Array.from(minitoc.querySelectorAll('[href="#'+slides[oldslidenum]['id']+'"]')).forEach(element => element.innerHTML='&#x25cb;');
	}
	if (slides[newslidenum]['id']=="title") minitoc.style.display='none'; else {
		minitoc.style.display='flex';
		if (slides[newslidenum]['id']=="outline") {
			Array.from(minitoc.querySelectorAll('div[data-section="'+slides[newslidenum]['section']+'"]')).forEach(element => element.classList.add('currentSection'));
		} else {
			Array.from(minitoc.querySelectorAll('[href="#'+slides[newslidenum]['id']+'"]')).forEach(function(element) {
				element.innerHTML='&#x25cf;';
				let subsection=element.closest('span');
				if (subsection) subsection.classList.add('currentSubsection');
				let section=element.closest('.section');
				if (section) section.classList.add('currentSection');
			});
		}
	}
}

/**********************************
 *             Footer             *
 **********************************/
/**
 * Add a footer to the presentation
 */
function add_footer() {
	let footer=document.createElement('footer');
	footer.setAttribute('id','footer');
	let titles=document.getElementById('title');
	let title=titles.getElementsByTagName('h1')[0].innerHTML;
	let i=title.indexOf('<');
	if (i>=0) title=title.substring(0,i);
	footer.innerHTML='<div>'+titles.getElementsByTagName('time')[0].innerHTML+'</div><div>'+title.trim()+'</div><div></div>';
	document.body.insertAdjacentElement('afterbegin',footer);
}

/**
 * Update the footer when a new slide is displayed. The function change the page index in the footer
 * @param {number} newslide - DOM object representing the new slide
 */
function update_footer(newslide) {
	let footer=document.getElementById('footer');
	if (newslide.id.startsWith('slide-') || newslide.id=="outline") {
		footer.style.display='block';
		footer.querySelector('div:last-child').innerHTML=getSlideIndex(newslide.id)+'/'+(slides.length-1);
	} else footer.style.display='none';
}

/**********************************
 *         Outline slides         *
 **********************************/
/**
 * Compose an outline slide. The same outline slide, with id <tt>outline</tt> is used for the whole presentation. This function populates it with the names of sections and subsections.
 * @see {@link add_navigation_bar} for additional information about how new sections and subsections are declared.
 */
function compose_outline_slide() {
	let outline=document.getElementById('outline').getElementsByClassName('content')[0];
	let content=document.createElement('ul');
	outline.insertAdjacentElement('afterbegin',content);
	let csection=null;
	let csubsection=null;
	Array.from(document.getElementsByClassName('slide')).forEach(function(element) {
		if (element.dataset['section']) {
			let sname=element.dataset['section'];
			csection=document.createElement('li');
			csection.dataset['section']=sname;
			csection.innerHTML='<a href="#'+element.id+'">'+sname+'</a>';
			content.insertAdjacentElement('beforeend',csection);
			csubsection=null;
		}
		if (element.dataset['subsection']) {
			if (!csubsection) {
				csubsection=document.createElement('ul');
				csection.insertAdjacentElement('beforeend',csubsection);
			}
			csubsection.insertAdjacentHTML('beforeend','<li><a href="#'+element.id+'">'+element.dataset['subsection']+'</a></li>');
		}
	});
}

/**
 * Update the outline slide based on the position in the presentation. The function highlights the current section in the outline slide.
 * @param {number} slidenum - Current slide index, relative to the {@link slides} array
 */
function update_outline_slide(slidenum) {
	let outline=document.getElementById('outline');
	if (slides[slidenum]['section']=="") {
		Array.from(outline.querySelectorAll('[data-section]')).forEach(function(element) {
			element.classList.remove('currentSection');
			element.classList.remove('notCurrentSection');
		});
	}
	else {
		Array.from(outline.querySelectorAll('[data-section]')).forEach(function(element) {
			element.classList.remove('currentSection');
			element.classList.add('notCurrentSection');
		});
		Array.from(outline.querySelectorAll('[data-section="'+slides[slidenum]['section']+'"]')).forEach(function(element) {
			element.classList.add('currentSection');
			element.classList.remove('notCurrentSection');
		});
	}
}

/**********************************
 *        Printing management     *
 **********************************/
/**
 * Make thumbnails out of the slides. The function scales all slides, displays their final fragments, and places them of a flexbox div.
 */
function open_print_view() {
	// Wrap all slides in new divs to put them in a flexbox layout, and make them thumbnails
	document.querySelectorAll('body > section').forEach(function(element) {
		element.classList.add('thumbnail');
		reset_fragments(element,getSlideElement(element.id)['numfragments']);
		let wrapper=document.createElement('div');
		wrapper.classList.add('wthumb');
		element.parentNode.insertBefore(wrapper,element);
		wrapper.appendChild(element);
	});
	let nwrapper=document.createElement('div');
	nwrapper.id='thumblayer';
	let firstdiv=document.querySelector('body div.wthumb');
	firstdiv.parentNode.insertBefore(nwrapper,firstdiv);
	document.querySelectorAll('body div.wthumb').forEach(function(element) {
		nwrapper.appendChild(element);
	});
	// Remove outline slide if visible
	if (slides[curslide]['id']=='outline') getSlide(curslide).style.display='none';
	// Converts thead tags to tbody with class 'dummy-header'. This is intended to prevent the browser from trying to repeat in several times when printing.
	document.querySelectorAll('thead').forEach(function(element) {
		let newel=document.createElement('tbody');
		newel.classList.add('dummy-header');
		newel.innerHTML=element.innerHTML;
		element.parentNode.replaceChild(newel,element);
	});
}

/**
 * Restore the view to its original state after printing
 */
function close_print_view() {
	// Unwrap all slides from their flexbox layout
	document.getElementById('thumblayer').querySelectorAll('div.wthumb').forEach(function(element) {
		element.firstChild.classList.remove('thumbnail');
		reset_fragments(element,0);
		let parent=element.parentNode;
		parent.insertBefore(element.firstChild,element);
		parent.removeChild(element);
	});
	let tl=document.getElementById('thumblayer');
	let parent=tl.parentNode;
	while (tl.firstChild) parent.insertBefore(tl.firstChild,tl);
	parent.removeChild(tl);
	// Remakes outline slide visible if it is selected
	if (slides[curslide]['id']=='outline') getSlide(curslide).style.display='flex';
	// Converts back dummy tbody tags to thead tags 
	document.querySelectorAll('tbody.dummy-header').forEach(function(element) {
		let newel=document.createElement('thead');
		newel.innerHTML=element.innerHTML;
		element.parentNode.replaceChild(newel,element);
	});
}

/**********************************
 *        Overview management     *
 **********************************/
/**
 * Open an overview of all slides. The function scales all slides, places them on a flexbox div, blurs the background, and animates the transition from the current slide to its new position.
 */
function open_overview() {
	on_overview=true;
	overview_curslide=curslide;
	// Add the overlay to blur the background
	document.body.insertAdjacentHTML('afterbegin','<div id="coverlayer"></div>');
	document.getElementById('coverlayer').style.opacity='1';
	let slideo=getSlide(curslide);
	let oldpos=slideo.getBoundingClientRect(); // Remember the position of the current slide
	// Wrap all slides in new divs to put them in a flexbox layout, and make them thumbnails
	document.querySelectorAll('body > section').forEach(function(element) {
		element.classList.add('thumbnail');
		let wrapper=document.createElement('div');
		wrapper.classList.add('wthumb');
		element.parentNode.insertBefore(wrapper,element);
		wrapper.appendChild(element);
		wrapper.addEventListener('click',function() {
			close_overview(getSlideIndex(element.id));
		});
	});
	let nwrapper=document.createElement('div');
	nwrapper.id='thumblayer';
	let firstdiv=document.querySelector('body div.wthumb');
	firstdiv.parentNode.insertBefore(nwrapper,firstdiv);
	document.querySelectorAll('body div.wthumb').forEach(function(element) {
		nwrapper.appendChild(element);
	});
	if (slideo.id!='outline') {
		let wrapper=slideo.parentNode;
		// Scroll the overview div so that the current slide is visible
		let tl=document.getElementById('thumblayer');
		tl.scrollTop=tl.offsetTop+wrapper.offsetTop;
		wrapper.style.zIndex='30';
		let newpos=wrapper.getBoundingClientRect();	// Remember the new position of the current slide
		let deltal=newpos.left-oldpos.left;
		let deltat=newpos.top-oldpos.top;
		let deltaw=newpos.width/oldpos.width-1;
		let deltah=newpos.height/oldpos.height-1;
		// Put back the current slide at its original position
		slideo.classList.remove('thumbnail');
		slideo.style.position='fixed';
		slideo.style.transformOrigin='left top';
		slideo.style.backgroundColor='white';
		slideo.style.visibility='visible';
		setTimeout(function() {
			slideo.classList.add('overview-transition');
			// Animate the transition while blurring the background
			slideo.addEventListener('transitionend',function(event) {
				slideo.style.transform=null;
				slideo.style.position=null;
				slideo.style.transformOrigin=null;
				slideo.style.backgroundColor=null;
				slideo.style.visibility=null;
				slideo.classList.add('thumbnail');
				slideo.classList.remove('overview-transition');
				wrapper.style.zIndex=null;
			},{capture:false,once:true});
			setTimeout(function() {
				slideo.style.transform='translate('+newpos.left+'px, '+newpos.top+'px) scale('+(newpos.width/oldpos.width)+', '+(newpos.height/oldpos.height)+')';
				getSlide(overview_curslide).classList.add('targetted'); // Add a visual style to the targetted slide in the overview
			},20);
		},20);
	}
}

/**
 * Close the overview. This function puts all slides to their original states, removes the divs created to make the overview, and animates the selected slide while it grows to the whole screen.
 * @param {number} newslidenum - Selected slide which shall become the active slide when the overview is closed. If null, the previously active slide remains active.
 */
function close_overview(newslidenum=null) {
	function remove_overview_wrapper() {
		document.getElementById('thumblayer').querySelectorAll('div.wthumb').forEach(function(element) {
			element.firstChild.classList.remove('thumbnail');
			let parent=element.parentNode;
			parent.insertBefore(element.firstChild,element);
			parent.removeChild(element);
		});
		let tl=document.getElementById('thumblayer');
		let parent=tl.parentNode;
		while (tl.firstChild) parent.insertBefore(tl.firstChild,tl);
		parent.removeChild(tl);
	}
	on_overview=false;
	getSlide(overview_curslide).classList.remove('targetted');	// Remove the visual style of the targetted slide in the overview
	if (newslidenum==null) newslidenum=curslide;	// If no new slide was selected, the previously active slide will be animated to cover the whole screen
	let slideo=getSlide(newslidenum);
	if (slideo.id=='outline') {
		let cl=document.getElementById('coverlayer');
		cl.addEventListener('transitionend',function(event) {
			cl.parentNode.removeChild(cl);
		});
		cl.style.opacity='0';
		remove_overview_wrapper();
	} else {
		slideo.parentNode.style.zIndex='30';
		let oldpos=slideo.getBoundingClientRect();	// Remember the current position of the selected slide
		let deltal=oldpos.left;
		let deltat=oldpos.top;
		let deltaw=oldpos.width/window.innerWidth-1;
		let deltah=oldpos.height/window.innerHeight-1;
		// Detach the selected slide from the flexbox layout
		slideo.style.position='fixed';
		slideo.style.transformOrigin='left top';
		slideo.style.backgroundColor='white';
		slideo.style.transform='translate('+(oldpos.left)+'px, '+(oldpos.top)+'px) scale('+(oldpos.width/window.innerWidth)+','+(oldpos.height/window.innerHeight)+')';
		// Animate the selected slide from its position in the overview to the whole screen, while unblurring the background
		let cl=document.getElementById('coverlayer');
		cl.addEventListener('transitionend',function(event) {
			cl.parentNode.removeChild(cl);
		});
		cl.style.opacity='0';
		setTimeout(function() {
			slideo.classList.add('overview-transition');
			slideo.addEventListener('transitionend',function(event) {
				slideo.style.transform=null;
				slideo.style.position=null;
				slideo.style.transformOrigin=null;
				slideo.style.backgroundColor=null;
				slideo.classList.remove('overview-transition');
				remove_overview_wrapper();
				// Prepare the new slide
				if (newslidenum!=curslide) {
					let newslideo=getSlide(newslidenum);
					let slideo=getSlide(curslide);
					let slide=curslide;
					curslide=newslidenum;
					curfragment=0;
					reset_fragments(newslideo,0);
					slideo.style.visibility=null;
					if (slideo.dataset["onhide"]) window[slideo.dataset["onhide"]](slideo);
					newslideo.style.visibility='visible';
					if (newslideo.dataset["onshow"]) window[newslideo.dataset["onshow"]](newslideo);
					program_hashchange=true;
					location.hash="#"+newslideo.id;
					newslideo.visibility=null;
					reset_fragments(slideo,0);
					update_navigation_bar(newslidenum,slide);
					update_footer(newslideo);
					if (newslideo.dataset['background']) {
						document.getElementById('background').style.backgroundImage='url('+newslideo.dataset['background']+')';
					}
				} else {
					let e=document.createEvent('HTMLEvents');
					e.initEvent('hashchange',false,true);
					window.dispatchEvent(e);
				}
			},{capture:false,once:true});
			setTimeout(function() {
				slideo.style.transform='translate(0px,0px) scale(1,1)';
			},20);
		},20);
	}
}

/**********************************
 *        Slide movement          *
 **********************************/
/**
 * This function is executed when the user performs an action to call for the next slide (swipe towards left side, right button).
 */
function to_next_slide() {
	if (!on_overview) {
		let newslide=curslide;
		let newfragment=curfragment;
		if (curfragment==slides[curslide]['numfragments']) {
			if (curslide<slides.length-1) {
				newslide++;
				newfragment=0;
				switch_slide(newslide,newfragment);
			}
		} else {
			newfragment++;
			switch_slide(newslide,newfragment);
		}
	}
}

/**
 * This function is executed when the user performs an action to call for the previous slide (swipe towards right side, left button).
 */
function to_previous_slide() {
	if (!on_overview) {
		let newslide=curslide;
		let newfragment=curfragment;
		if (curfragment==0) {
			if (curslide>0) {
				newslide--;
				newfragment=0;
				switch_slide(newslide,newfragment);
			}
		} else {
			newfragment--;
			switch_slide(newslide,newfragment);
		}
	}
}

/**
 * Display a new slide or a new fragment. The function applies an animation to go from the old slide to the new one.
 * @param {number} newslidenum - New slide index, relative to the {@link slides} array
 * @param {number} newfragmentnum - New fragment index
 */
function switch_slide(newslidenum,newfragmentnum) {
	let increasing=(newslidenum>curslide || (newslidenum==curslide && newfragmentnum>curfragment));
	let newslideo=getSlide(newslidenum);
	let slideo=getSlide(curslide);
	if (newslidenum!=curslide) {
		let slide=curslide;
		curslide=newslidenum;
		curfragment=newfragmentnum;
		if (increasing) {
			reset_fragments(newslideo,0); 
			apply_start_fragments(newslideo,true);
		} else reset_fragments(newslideo,slides[newslidenum]['numfragments']);
		if (newslideo.id=="outline") update_outline_slide(newslidenum);
		apply_animation(slideo,newslideo,increasing,function() {
			reset_fragments(slideo,0);
			apply_start_fragments(newslideo,false);
			animate_fragment(curslide,0,curslide>slide);
			update_navigation_bar(newslidenum,slide);
			update_footer(newslideo);
		});
		if (newslideo.dataset['background']) {
			document.getElementById('background').style.backgroundImage='url('+newslideo.dataset['background']+')';
		}
	} else if (curfragment!=newfragmentnum) {
		let fragment=curfragment;
		curfragment=newfragmentnum;
		animate_fragment(curslide,newfragmentnum,newfragmentnum>fragment);
		reset_fragments(newslideo,newfragmentnum);
	}
}

/**********************************
 *        Swipe handling          *
 **********************************/
function getTouches(evt) {
	return evt.touches || evt.originalEvent.touches;
}

/**
 * Function called when the user initiates a swipe movement.
 * @param {object} evt - Event object
 */
function handleTouchStart(evt) {
	xDown=getTouches(evt)[0].clientX;
	yDown=getTouches(evt)[0].clientY;
}

/**
 * Function called when the user is moving his finger in a swipe movement.
 * @param {object} evt - Event object
 */
function handleTouchMove(evt) {
	xUp=getTouches(evt)[0].clientX;
	yUp=getTouches(evt)[0].clientY;
}

/**
 * Function called when the user releases the screen in a swipe movement.
 * @param {object} evt - Event object
 */
function handleTouchEnd(evt) {
	if (xDown==null || yDown==null || xUp==null || yUp==null) return;
	if (Math.abs(xUp-xDown)>Math.abs(yUp-yDown)) {
		if (Math.abs(xUp-xDown)>200) {
			if (xUp>xDown) to_previous_slide(); else to_next_slide();
		}
	} 
}

/**********************************
 * Handling of push/pull signals  *
 **********************************/
/**
 * Asynchronously update the location hash on the server. All clients will be notified of the update and will synchronize with the new hash.
 * @param {string} url - Url of the script on the server
 * @param {string} name - Name used for the synchronization channel
 */
function signal(url,name) {
	let xhttp=new XMLHttpRequest();
	xhttp.open('POST',url,true);
	xhttp.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
	xhttp.send('push='+name+'&hash='+location.hash);
}

/**
 * This event handler is meant to be used as the keyUp event handler for the Syncname input field. Updates the syncName variable as read from user input and closes the query bar
 * @param {event} event - Event object
 */
function getSyncName(event) {
	if (event.keyCode==13) {
		let syncf=document.getElementById('syncName');
		syncName=syncf.value;
		if (syncName=='') syncName=null;
		let bar=syncf.parentNode;
		bar.addEventListener('transitionend',function() {
			bar.parentNode.removeChild(bar);
		},{capture:false,once:true});
		bar.style.top=null;
	}
	event.stopPropagation();
}

/**
 * Asynchronously query the new location hash from the server and update the position to synchronize with the server. This function polls the server at a regular interval (10 seconds).
 * @param {string} url - Url of the script on the server
 * @param {string} name - Name used for the synchronization channel
 */
function pollSync(url,name) {
	setInterval(function() {
		if (slaveMode) {
			let xhttp=new XMLHttpRequest();
			xhttp.open('POST',url,true);
			xhttp.setRequestHeader("Content-Type","application/x-www-form-urlencoded");
			xhttp.onreadystatechange=function() {
				if (this.readyState==XMLHttpRequest.DONE && this.status==200) location.hash=this.responseText;
			}
			xhttp.send('pull='+name);
		}
	},10000);
}

/**
 * Query the new location hash from the server and update the position to synchronize with the server. This function listens to HTML5 server-sent events.
 * @param {string} url - Url of the script on the server
 * @param {string} name - Name used for the synchronization channel
 */
function registerSync(url,name) {
	let source=new EventSource(url+'?register='+encodeURIComponent(name));
	source.onmessage=function(e) {
		if (slaveMode) location.hash=e.data;
	};
}

/**
 * Toggle synchronization slave mode.
 * @param {object} elem - Element which has been clicked on to toggle the slave mode.
 */
function toggleSync(elem) {
	slaveMode=!slaveMode;
	if (slaveMode) {
		elem.textContent="Activée";
		elem.parentNode.classList.replace('inactive','active');
	} else {
		elem.textContent="Désactivée";
		elem.parentNode.classList.replace('active','inactive');
	}
}

/**********************************
 *     Main document functions    *
 **********************************/
document.addEventListener("DOMContentLoaded",function(event) {
	// Load external SVG files
	let svgpromises=[];
	Array.from(document.querySelectorAll('div [data-file]')).forEach(function(element) {
		svgpromises.push(new Promise(function(resolve,reject) {
			let xhttp=new XMLHttpRequest();
			xhttp.open('GET',element.dataset['file'],true);
			xhttp.onreadystatechange=function() {
				if (this.readyState==XMLHttpRequest.DONE && this.status==200) {
					element.outerHTML=this.responseText;
					resolve();
				}
			}
			xhttp.send();
		}));
	});
	Promise.all(svgpromises).then(afterLoad);
});

function afterLoad() {
	window.name="parentpres";
	syncUrl=document.documentElement.dataset['synchronize'];
	// Create background
	document.body.insertAdjacentHTML('afterbegin','<div id="background"></div>');

	// Attribute id to each slide
	Array.from(document.getElementsByClassName('slide')).forEach(function(element,index) {
		let id="slide-"+(index+1);
		element.id=id;
		if ('#'+id==location.hash) element.style.visibility='visible';
	})

	// Prepare the array of slides
	slides.push({'id':'title'});
	Array.from(document.getElementsByClassName('slide')).forEach(function(element) {
		slides.push({'id':element.id});
	});
	count_fragments(); // Count fragments in each slide
	compose_outline_slide(); // Fill out outline slides
	Array.from(document.querySelectorAll('section[data-section]')).forEach(function(element) {
		let index=getSlideIndex(element.id);
		slides.splice(index,0,{'id':'outline','numfragments':0,'section':element.dataset['section']});
	});
	slides.splice(1,0,{'id':'outline','numfragments':0,'section':''});

	// Get current slide
	if (location.hash=='') location.hash='#title';
	if (location.hash=="#title") curslide=0; 
		else if (location.hash=="#outline") {
			curslide=getSlideIndex('outline');
		} else curslide=parseInt(getSlideIndex(location.hash.substring(1)));
	document.getElementById('background').style.backgroundImage='url('+getSlide(curslide).dataset['background']+')';

	// Add navigation bar
	add_navigation_bar();
	update_navigation_bar(curslide);

	// Add footer bar
	add_footer();
	update_footer(getSlide(curslide));

	// Hash change handler
	window.addEventListener('hashchange',function() {
		if (program_hashchange) {
			program_hashchange=false;
		} else {
			let slide=curslide;
			getSlide(curslide).style.visibility=null;
			curslide=getSlideIndex(location.hash.substring(1));
			let curslideo=getSlide(curslide);
			curslideo.style.visibility='visible';
			document.getElementById('background').style.backgroundImage='url('+curslideo.dataset['background']+')';
			update_navigation_bar(curslide,slide);
			update_footer(curslideo);
			reset_fragments(curslideo,0);
		}
		if (wnotes!=null && !wnotes.closed) {
			wnotes.location.hash=location.hash;
			wnotes.ratio=curslide/slides.length;
		}
		if (!slaveMode && syncUrl && syncName) {
			signal(syncUrl,syncName,location.hash);
		}
	});

	// Pull mode, synchronize with presenter
	if (syncUrl) {
		let params=location.search.substr(1).split('&');
		for (let i=0;i<params.length;++i) params[i]=params[i].split('=');
		let sync=params.find(element => (element[0]=='sync' || element[0]=='syncp'));
		if (sync) {
			slaveMode=true;
			let el=document.createElement('div');
			el.id='syncstatus';
			el.innerHTML='Synchronisation : <span class="active"><a href="#" onClick="toggleSync(this);return false;">Activée</a></span>';
			document.body.insertAdjacentElement('afterbegin',el);
			if (sync[0]=='sync') registerSync(syncUrl,sync[1]); else pollSync(syncUrl,sync[1]);
		}
	}

	// Print mode
	window.onbeforeprint=open_print_view;
	window.onafterprint=close_print_view;

	// Handle swipe events
	document.addEventListener('touchstart',handleTouchStart,false);
	document.addEventListener('touchmove',handleTouchMove,false);
	document.addEventListener('touchend',handleTouchEnd,false);

	// Handle key events
	document.addEventListener('keydown',function(e) {
		let newslide=curslide;
		let newfragment=curfragment;
		switch (e.keyCode) {
			case 39:case 32:	// Right arrow, Space
				if (!on_overview) {
					to_next_slide();
				} else {
					if (overview_curslide<slides.length-1) {
						getSlide(overview_curslide).classList.remove('targetted');
						do {
							++overview_curslide;
						} while (overview_curslide<slides.length-1 && getSlide(overview_curslide).id=="outline");
						let oslideo=getSlide(overview_curslide);
						oslideo.classList.add('targetted');
						oslideo=oslideo.parentNode;
						let tl=document.getElementById('thumblayer');
						if (oslideo.offsetTop+oslideo.offsetHeight>tl.offsetHeight+tl.scrollTop) tl.scrollTop+=tl.offsetHeight/2;
					}
				}
				break;
			case 37:	// Left arrow
				if (!on_overview) {
					to_previous_slide();
				} else {
					if (overview_curslide>0) {
						getSlide(overview_curslide).classList.remove('targetted');
						do {
							--overview_curslide;
						} while (overview_curslide>0 && getSlide(overview_curslide).id=="outline");
						let oslideo=getSlide(overview_curslide);
						oslideo.classList.add('targetted');
						oslideo=oslideo.parentNode;
						let tl=document.getElementById('thumblayer');
						if (oslideo.offsetTop<tl.scrollTop) tl.scrollTop-=tl.offsetHeight/2;
					}
				}
				break;
			case 38:	// Up arrow
				if (!on_overview) {
					if (curslide>0) {
						newslide--;
						newfragment=slides[newslide]['numfragments'];
						switch_slide(newslide,newfragment);
					}
				}
				break;
			case 40:	// Down arrow
				if (!on_overview) {
					if (curslide<slides.length-1) {
						newslide++;
						newfragment=0;
						switch_slide(newslide,newfragment);
					}
				}
				break;
			case 33: // Page up
				if (!on_overview) {
					if (newslide>0) newslide--;
					while (newslide>0 && getSlide(newslide).id!='outline') newslide--;
					newfragment=0;
					switch_slide(newslide,newfragment);
				}
				break;
			case 34: // Page down
				if (!on_overview) {
					if (newslide<slides.length-1) newslide++;
					while (newslide<slides.length-1 && getSlide(newslide).id!='outline') newslide++;
					newfragment=0;
					switch_slide(newslide,newfragment);
				}
				break;
			case 36: // Home
				if (!on_overview) {
					newslide=0;
					newfragment=0;
					switch_slide(newslide,newfragment);
				}
				break;
			case 35: // End
				if (!on_overview) {
					newslide=slides.length-1;
					newfragment=slides[newslide]['numfragments'];
					switch_slide(newslide,newfragment);
				}
				break;
			case 79:	// 'o'
				if (!on_overview) {
					open_overview();
				} else {
					close_overview();
				}
				break;
			case 13:	// enter
				if (on_overview) close_overview(overview_curslide);
				break;
			case 78:	// 'n'
				if (wnotes==null || wnotes.closed) {
					wnotes=window.open(document.documentElement.dataset['notes']+"#"+getSlide(curslide).id,"Notes","left=0, top=0, status=no, menubar=no, toolbar=no, location=no, directories=no, copyhistory=no, width='+w+', height='+h', fullscreen=yes");
				} else {
					wnotes.close();
				}
				break;
			case 188:	// ','
				if (wnotes!=null && !wnotes.closed) {
					let obj=wnotes.document.getElementById('notes');
					obj.scrollTop+=wnotes.screen.height/2;
				}
				break;
			case 190:	// ';'
				if (wnotes!=null && !wnotes.closed) {
					let obj=wnotes.document.getElementById('notes');
					obj.scrollTop-=wnotes.screen.height/2;
				}
				break;
			case 83:	// 's'
				if (syncUrl) {
					e.stopImmediatePropagation();
					let syncd=document.createElement('div');
					syncd.id='synchronize';
					syncd.innerHTML='Identifiant de synchronisation : <input type="text" id="syncName" maxlength="30">';
					document.body.insertAdjacentElement('afterbegin',syncd);
					setTimeout(function() {
						syncd.style.top='0px';
						let obj=syncd.lastChild;
						obj.addEventListener('keydown',() => {event.stopPropagation()},false);
						obj.addEventListener('keyup',getSyncName,false);
						obj.focus();
					},20);
				}
				break;
		}
	});

}
