var startTime=new Date();
var duration=null;
var ratio=null;
var timeElement=null;
var elapsedElement=null;
var ratioElement=null;

function twoDigits(n) {
	let s='0'+n;
	return s.substr(s.length-2);
}

function toHMS(tim) {
	let s='';
	if (tim>3600) {
		s+=Math.floor(tim/3600)+':';
		tim=tim%3600;
	} 
	s+=twoDigits(Math.floor(tim/60))+':';
	tim=tim%60;
	s+=twoDigits(Math.floor(tim));
	return s;
}

function updateClocks() {
	// Update current time
	let tim=new Date();
	timeElement.innerHTML=twoDigits(tim.getHours())+':'+twoDigits(tim.getMinutes());
	// Update chrono
	tim=(tim-startTime)/1000;
	elapsedElement.innerHTML=toHMS(tim);
	// Update ratio
	if (duration && ratio) {
		let diff=ratio*duration-tim;
		ratioElement.innerHTML=toHMS(Math.abs(diff));
		if (diff>0) {
			if (!ratioElement.classList.contains('early')) {
				ratioElement.classList.remove('late');
				ratioElement.classList.add('early');
			}
		} else {
			if (!ratioElement.classList.contains('late')) {
				ratioElement.classList.remove('early');
				ratioElement.classList.add('late');
			}
		}
	}
}

document.addEventListener("message",function(event) {
	let sections=document.getElementsByTagName('h2');
	let num=sections.length;
	let i=0;
	while (i<num && sections[i].innerHTML!=event.data) ++i;
	if (i<num) sections[i].scrollIntoView();
},false);

document.addEventListener("DOMContentLoaded",function(event) {
	let wrapper=document.createElement('div');
	wrapper.id='notes';
	elements=document.body.children;
	while (elements.length && elements[0].tagName!='SCRIPT') wrapper.appendChild(elements[0]);
	document.body.insertAdjacentElement('afterbegin',wrapper);
	document.body.insertAdjacentHTML('beforeend','<aside><div id="next"></div><div class="space"></div><div class="counter" id="time"><h1>Heure</h1></p></div><div class="counter" id="elapsed"><h1>Temps passé</h1><p></p></div><div class="counter" id="ratio"><h1><span class="early">Avance</span>/<span class="late">Retard</span></h1><p></p></div></aside>');
	let dur=document.documentElement.dataset['duration'];
	if (dur) {
		let reg=/^(?:(\d+) *h)? *(?:(\d+) *(?:mn|min))? *(?:(\d+) *(?:s))? *$/i;
		let res=reg.exec(dur);
		if (res) {
			duration=0;
			if (res[1]) duration+=3600*res[1];
			if (res[2]) duration+=60*res[2];
			if (res[3]) duration+=res[3];
		}
	} else document.getElementById('ratio').style.display='none';
	timeElement=document.getElementById('time').getElementsByTagName('p')[0];
	elapsedElement=document.getElementById('elapsed').getElementsByTagName('p')[0];
	ratioElement=document.getElementById('ratio').getElementsByTagName('p')[0];
	setInterval(updateClocks,1000);
});
